
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
function discoverScripts(fromDir: string)
{
	enum Kind { external, local, outFile };
	const scripts: { kind: Kind, path: string }[] = [];
	const hasScript = (path: string) => scripts.some(s => s.path === path);
	
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
		
		for (const script of tsConfig.moduless.scripts)
		{
			if (typeof script === "string")
			{
				if (hasScript(script))
					continue;
				
				const scriptUrl = Url.parse(script);
				if (scriptUrl.protocol === "http:" || scriptUrl.protocol === "https:")
				{
					scripts.push({ kind: Kind.external, path: script });
					continue;
				}
				else if (scriptUrl.protocol === null)
				{
					scripts.push({ kind: Kind.local, path: Path.join(tsConfigDirPath, script) });
					continue;
				}
			}
			
			console.log("Invalid script URL: " + String(script));
		}
		
		if (tsConfig.compilerOptions.outFile)
		{
			const outFile = Path.join(tsConfigDirPath, tsConfig.compilerOptions.outFile);
			if (!hasScript(outFile))
				scripts.push({ kind: Kind.outFile, path: outFile });
		}
	}
	
	recurse(fromDir, "tsconfig.json");
	
	if (options.verbose)
		for (const entry of scripts)
			console.log(`Including ${Kind[entry.kind]} script: ` + entry.path);
	
	const localScriptPaths = scripts
		.filter(sc => sc.kind !== Kind.external)
		.map(sc => sc.path);
	
	const commonPath = localScriptPaths.length === 1 ?
		findCommonPath(localScriptPaths.concat(process.cwd())) :
		findCommonPath(localScriptPaths);
	
	for (const entry of scripts)
		if (entry.kind !== Kind.external)
			entry.path = entry.path.slice(commonPath.length);
	
	return {
		scripts: scripts.map(sc => sc.path),
		root: commonPath
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
	console.log("Moduless available at: http://127.0.0.1:" + options.port);
}
