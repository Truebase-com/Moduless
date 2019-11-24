
const Fs: typeof import("fs") = require("fs");
const Path: typeof import("path") = require("path");
const Url: typeof import("url") = require("url");
const Http: typeof import("http") = require("http");

/** */
const options = (() =>
{
	const startingConfig = Path.join(process.cwd(), "tsconfig.json");
	
	if (!Fs.existsSync(startingConfig))
		throw new Error("Config file not found: " + startingConfig);
	
	const tsConfig = parseTsConfigFile(startingConfig);
	return tsConfig.moduless;
})();

/**
 * 
 */
function parseTsConfigFile(tsConfigFilePath: string)
{
	type TReference = {
		path: string;
		prepend: boolean;
	};
	
	type TRelevantConfig = {
		compilerOptions: {
			outFile: string
		},
		references: TReference[],
		moduless: {
			port: number,
			verbose: boolean,
			scripts: string[]
		}
	};
	
	const tsConfig = <TRelevantConfig>parseJsonFile(tsConfigFilePath);
	
	if (!tsConfig.compilerOptions)
		tsConfig.compilerOptions = { outFile: "" };
	
	else if (!tsConfig.compilerOptions.outFile)
		tsConfig.compilerOptions.outFile = "";
	
	if (!tsConfig.references)
		tsConfig.references = [];
	
	if (!tsConfig.moduless)
		tsConfig.moduless = { port: 7007, verbose: false, scripts: [] };
	
	else
	{
		tsConfig.moduless.port = tsConfig.moduless.port || 7007;
		tsConfig.moduless.verbose = !!tsConfig.moduless.verbose;
		
		const scripts = tsConfig.moduless.scripts;
		tsConfig.moduless.scripts = 
			Array.isArray(scripts) ? scripts :
			typeof scripts === "string" ? [scripts] :
			[];
	}
	
	return tsConfig;
}

/**
 * 
 */
function parseJsonFile(jsonFilePath: string)
{
	const fileText = Fs.readFileSync(jsonFilePath, "utf8");
	
	try
	{
		return new Function("return (" + fileText + ");")();
	}
	catch (e)
	{
		return null;
	}
}

/**
 * 
 */
function recurseTsConfigFiles(fromDir: string)
{
	const discoveredOutFiles: string[] = [];
	const localScripts: string[] = [];
	const externalScripts: string[] = [];
	
	//
	const qualifyPath = (unqualifiedPath: string) =>
	{
		const resolved = Path.resolve(unqualifiedPath);
		
		if (Path.extname(resolved) === ".json")
			return resolved;
		
		return Path.join(resolved, "tsconfig.json");
	};
	
	const visitedPaths: string[] = [];
	
	//
	const recurse = (currentPath: string, targetConfigPath: string) =>
	{
		const resolvedConfigPath = Path.resolve(currentPath, targetConfigPath);
		const tsConfigFilePath = qualifyPath(resolvedConfigPath);
		const tsConfigDirPath = Path.dirname(tsConfigFilePath);
		
		if (!Fs.existsSync(tsConfigFilePath))
		{
			console.warn("File does not exist: " + tsConfigFilePath);
			return;
		}
		
		if (visitedPaths.includes(tsConfigFilePath))
		{
			console.warn("Circular project reference including: " + tsConfigFilePath);
			return;
		}
		
		visitedPaths.push(tsConfigFilePath);
		const tsConfig = parseTsConfigFile(tsConfigFilePath);
		
		for (const refEntry of tsConfig.references)
		{
			const refPath = refEntry.path;
			const prepend = !!refEntry.prepend;
			
			// We have to avoid following projects that are "prepend",
			// because they'll already be in the output.
			if (prepend)
			{
				if (options.verbose)
					console.log(`(Found ${refPath}, but skipping because "prepend" is true.)`);
				
				continue;
			}
			
			if (typeof refPath !== "string")
				continue;
			
			recurse(tsConfigDirPath, refPath);
		}
		
		if (tsConfig.compilerOptions.outFile)
		{
			const outFile = Path.join(tsConfigDirPath, tsConfig.compilerOptions.outFile);
			if (!discoveredOutFiles.includes(outFile))
				discoveredOutFiles.push(outFile);
		}
		
		for (const script of tsConfig.moduless.scripts)
		{
			if (typeof script === "string")
			{
				const scriptUrl = Url.parse(script);
				if (scriptUrl.protocol === "http:" || scriptUrl.protocol === "https:")
				{
					externalScripts.push(script);
					continue;
				}
				else if (scriptUrl.protocol === null)
				{
					localScripts.push(Path.join(tsConfigDirPath, script));
					continue;
				}
			}
			
			console.log("Invalid script URL: " + String(script));
		}
	}
	
	recurse(fromDir, "tsconfig.json");
	
	return {
		outFiles: discoveredOutFiles,
		local: localScripts,
		external: externalScripts
	}
}

/**
 * Finds the common path between an array of 
 * absolute paths.
 */
function findCommonPath(paths: string[])
{
	if (paths.length < 2)
		return "";
	
	const pathsBroken = paths
		.map(p => p.split(Path.sep))
		.sort((a, b) => a.length - b.length);
	
	const minPathLength = pathsBroken[0].length;
	let maxCommonPart = 0;
	
	outer: for (;;)
	{
		let currentPathItem: string | null = null;
		
		for (const path of pathsBroken)
		{
			if (currentPathItem === null)
				currentPathItem = path[maxCommonPart];
			
			else if (path[maxCommonPart] !== currentPathItem)
				break outer;
		}
		
		if (++maxCommonPart >= minPathLength)
			break;
	}
	
	return pathsBroken[0].slice(0, maxCommonPart).join(Path.sep);
}

/** 
 * 
 */
function launchServer(
	serverRoot: string,
	scriptPaths: string[])
{
	const indexHtml = [
		"<!doctype html>",
		...scriptPaths
			.map(path => `<script src="${path}"></script>`)
	].join("\n");
	
	const server = Http.createServer((req, res) =>
	{
		const urlParsed = Url.parse(req.url || "");
		
		if (urlParsed.path && (urlParsed.path.endsWith(".js") || urlParsed.path.endsWith(".json")))
		{
			const js = urlParsed.path.endsWith(".js");
			const jsFilePath = Path.join(serverRoot, urlParsed.path);
			
			if (!Fs.existsSync(jsFilePath))
				return console.error(
					`${js ? "JavaScript" : "JSON"} file not found: ${urlParsed.path}
					Resolved to: ${jsFilePath}`);
			
			const jsFileBuffer = Fs.readFileSync(jsFilePath);
			
			res.writeHead(200, {
				"Content-Type": js ? "text/javascript" : "application/json",
				"Content-Length": jsFileBuffer.length
			});
			
			res.write(jsFileBuffer);
		}
		else
		{
			res.writeHead(200, {
				"Content-Type": "text/html",
				"Content-Length": indexHtml.length
			});
			
			res.write(indexHtml);
		}
		
		res.end();
	});
	
	server.listen(options.port);
	console.log("Server listening on port: " + options.port);
}

/** */
function setTerminalTitle(title: string)
{
	process.stdout.write(
		String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
	);
}

/** */
(function start()
{
	setTerminalTitle("Moduless");
	
	const scripts = recurseTsConfigFiles(process.cwd());
	
	if (options.verbose)
	{
		for (const outFile of scripts.outFiles)
			console.log("Found outFile at location: " + outFile);
		
		for (const ext of scripts.external)
			console.log("Found external script: " + ext);
		
		for (const local of scripts.local)
			console.log("Found local script: " + local);
	}
	
	const commonPath = findCommonPath(scripts.outFiles);
	const includeScripts = scripts.outFiles
		.concat(scripts.local)
		.map(p => p.slice(commonPath.length))
		.concat(scripts.external);
	
	if (options.verbose)
	{
		console.log("Server root directory is: " + Path.resolve(commonPath));
	}
	
	launchServer(commonPath, includeScripts);
})();
