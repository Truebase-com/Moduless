
/** */
interface IOptions
{
	port: number;
	headless: boolean;
	target: string;
	verbose: boolean;
}

/** */
(async () =>
{
	/** */
	const options: IOptions = CommandLineArgs([
		{
			name: "port",
			alias: "p",
			type: Number,
			defaultValue: 7007
		},
		{
			name: "headless",
			alias: "h",
			type: Boolean,
			defaultValue: true
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
	]);
	
	const deb = new Debugger(options);
	const outFiles = deb.findOutFilesRecursive(options.target);
	
	if (options.verbose)
	{
		console.log("Discovered the following JavaScript files to include: ");
		for (const outFile of outFiles)
			console.log("\t" + outFile);
	}
	
	await deb.launchServer();
	await deb.launchBrowser(outFiles);
})();
