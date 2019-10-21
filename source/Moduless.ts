
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
	
	const initialTsConfig = parseJsonFile(startingConfig);
	const modulessConfig = initialTsConfig.moduless || {};
	
	return {
		port: (modulessConfig.port | 0) || 7007,
		verbose: !!modulessConfig.verbose
	};
})();

/**
 * 
*/
function parseJsonFile(jsonFilePath: string)
{
	const fileText = Fs.readFileSync(jsonFilePath, "utf8");
	
	try
	{
		return JSON.parse(fileText);
	}
	catch (e)
	{
		return null;
	}
}

/**
 * 
 */
function findNestedOutFiles(fromDir: string)
{
	const discoveredOutFiles: string[] = [];
	
	//
	const qualifyPath = (unqualifiedPath: string) =>
	{
		const resolved = Path.resolve(unqualifiedPath);
		
		if (Path.extname(resolved) === ".json")
			return resolved;
		
		return Path.join(resolved, "tsconfig.json");
	};
	
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
		
		const tsConfig = parseJsonFile(tsConfigFilePath);
		
		for (const refEntry of tsConfig.references || [])
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
		
		if (typeof tsConfig.compilerOptions === "object")
		{
			if (typeof tsConfig.compilerOptions.outFile === "string")
			{
				const outFile = Path.join(tsConfigDirPath, tsConfig.compilerOptions.outFile);
				if (!discoveredOutFiles.includes(outFile))
					discoveredOutFiles.push(outFile);
			}
		}
	}
	
	recurse(fromDir, "tsconfig.json");
	return discoveredOutFiles;
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
	
	if (options.verbose)
		console.log("Server listening on port: " + options.port);
}

/**
 * 
 */
(function start()
{
	const outFiles = findNestedOutFiles(process.cwd());
	const commonPath = findCommonPath(outFiles);
	const outFilesRelative = outFiles.map(p => p.slice(commonPath.length));
	launchServer(commonPath, outFilesRelative);
})();
