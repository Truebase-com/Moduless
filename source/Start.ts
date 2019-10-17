
/** */
interface IOptions
{
	port: number;
	open: boolean;
	target: string;
	verbose: boolean;
	help: boolean;
}

/** */
(async () =>
{
	/** */
	const layout = [
		{
			name: "help",
			type: Boolean
		},
		{
			name: "port",
			alias: "p",
			type: Number,
			defaultValue: 7007
		},
		{
			name: "open",
			alias: "o",
			type: Boolean,
			defaultValue: false
		},
		{
			name: "target",
			alias: "t",
			defaultOption: true,
			type: String,
			defaultValue: "."
		},
		{
			name: "verbose",
			alias: "v",
			type: Boolean,
			defaultValue: false
		}
	];
	
	const options: IOptions = CommandLineArgs(layout);
	
	if (options.help)
	{
		console.log("Options: ");
		
		for (const object of layout)
		{
			if (typeof object.defaultValue === "undefined")
				continue;
			
			const def = String(object.defaultValue);
			const msg = `--${object.name}, -${object.alias} [${object.name}]    (default: ${def})`;
			console.log(msg); 
		}
		
		return;
	}
	
	const deb = new Debugger(options);
	
	await deb.launchServer();
	console.log(`HTTP server listening at http://localhost:${options.port}`);
	
	const outFiles = deb.findOutFilesRecursive(options.target);
	await deb.launchBrowser(outFiles);
	
	if (options.verbose)
	{
		console.log("Discovered the following JavaScript files to include: ");
		for (const outFile of outFiles)
			console.log("\t" + outFile);
	}
})();
