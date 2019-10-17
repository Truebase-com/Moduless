
class Debugger
{
	/** */
	constructor(private readonly options: IOptions) { }
	
	/** */
	findOutFilesRecursive(startingDir: string)
	{
		const discoveredOutFiles: string[] = [];
		
		//
		const tryParseJson = (jsonText: string) =>
		{
			try
			{
				return JSON.parse(jsonText);
			}
			catch (e)
			{
				return null;
			}
		};
		
		//
		const qualifyPath = (unqualifiedPath: string) =>
		{
			const resolved = Path.resolve(unqualifiedPath);
			
			if (Path.extname(resolved) === "json")
				return resolved;
			
			return Path.join(resolved, "tsconfig.json");
		};
		
		//
		const recurse = (currentPath: string, targetPath: string) =>
		{
			const resolvedPath = Path.resolve(currentPath, targetPath);
			const tsConfigFilePath = qualifyPath(resolvedPath);
			const tsConfigDirPath = Path.dirname(tsConfigFilePath);
			
			if (!Fs.existsSync(tsConfigFilePath))
			{
				console.warn("File does not exist: " + tsConfigFilePath);
				return;
			}
			
			const tsConfigJsonText = Fs.readFileSync(tsConfigFilePath).toString("utf8");
			const tsConfig = tryParseJson(tsConfigJsonText);
			if (!tsConfig)
				return [];
			
			if (typeof tsConfig.compilerOptions === "object")
			{
				if (typeof tsConfig.compilerOptions.outFile === "string")
				{
					const outFile = Path.join(tsConfigDirPath, tsConfig.compilerOptions.outFile);
					
					if (!discoveredOutFiles.includes(outFile))
						discoveredOutFiles.push(outFile);
				}
			}
			
			const refsObject = tsConfig.references;
			if (!Array.isArray(refsObject))
				return [];
			
			for (const refEntry of refsObject)
			{
				const refPath = refEntry.path;
				const prepend = !!refEntry.prepend;
				
				// We have to avoid following projects that are "prepend",
				// because they'll already be in the output.
				if (prepend)
					continue;
				
				if (typeof refPath !== "string")
					continue;
				
				recurse(tsConfigDirPath, refPath);
			}
		}
		
		recurse(process.cwd(), startingDir);
		return discoveredOutFiles;
	}

	/** */
	async launchServer()
	{
		const server = Http.createServer((req, res) =>
		{
			const urlParsed = Url.parse(req.url || "");
			
			if (urlParsed.query)
			{
				const jsFileBuffer = Fs.readFileSync(urlParsed.query);
				
				res.writeHead(200, {
					"Content-Type": "text/javascript",
					"Content-Length": jsFileBuffer.length
				});
				
				res.write(jsFileBuffer);
			}
			else
			{
				const indexHtml = `<!doctype html>`;
				
				res.writeHead(200, {
					"Content-Type": "text/html",
					"Content-Length": indexHtml.length
				});
				
				res.write(indexHtml);
			}
			
			res.end();
		});
		
		server.listen(this.options.port);
	}

	/** */
	async launchBrowser(scriptPaths: string[])
	{
		const browser = await Puppeteer.launch({
			headless: this.options.headless,
			devtools: true,
			args: [
				"--allow-file-access-from-files",
				"--allow-cross-origin-auth-prompt",
				"--allow-external-pages",
				"--allow-insecure-localhost ",
				"--allow-running-insecure-content ",
				"--allow-sandbox-debugging ",
				"--enable-local-file-accesses"
			]
		});
		
		const page = await browser.newPage();
		const baseUrl = `http://localhost:${this.options.port}/`;
		await page.goto(baseUrl);
		
		page.on("console", msg => console.log(msg.text()));
		
		await page.evaluate((scripts: string[]) =>
		{
			for (const scriptUrl of scripts)
			{
				const script = document.createElement("script");
				script.src = "/?" + scriptUrl;
				document.head.appendChild(script);
			}
			
			return window.location.href;
		},
		scriptPaths);
	}
}
