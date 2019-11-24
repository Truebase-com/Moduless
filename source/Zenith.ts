
/** */
(function start()
{
	/** */
	function setTerminalTitle(title: string)
	{
		process.stdout.write(
			String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
		);
	}
	
	setTerminalTitle("Moduless");
	const discovery = discoverScripts(process.cwd());
	
	if (options.verbose)
		console.log("Serving from directory: " + Path.resolve(discovery.root));
	
	launchServer(discovery.root, discovery.scripts);
})();
