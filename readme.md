# Moduless

This is a debugging tool to support running TypeScript composite projects that don't use any module loading mechanism. 

## Usage

Install globally with:

```
npm install moduless -g
```

After installation, run the `moduless` command from the folder that contains the `tsconfig.json` file that is the starting point of your composite project. Moduless will recursively traverse the project references specified in this tsconfig file, cherry picking all `"outFile"` settings. 

Moduless then starts a hidden HTTP server that serves out an index.html file from the root, and this HTML file will contain a separate `<script src="...">` tag that points to each discovered `"outFile"`.

When the Moduless server is running, you should be able to debug complex TypeScript composite projects, without ever having to use a single `import` anywhere.

For Visual Studio Code, you'll need a `launch.json` configuration that sets the `webRoot` to the folder that contains all referenced composites. For example, if your composite projects look like:

- /Users/you/folder/project/a/tsconfig.json
- /Users/you/folder/project/b/tsconfig.json

The `webRoot` should be:
- /Users/you/folder/project/

Below is an example of a launch.json:

```json
{
	"version": "0.2.0",
	"configurations": [{
		"type": "chrome",
		"request": "launch",
		"name": "???",
		"url": "http://localhost:7007",
		"port": 9222,
		"webRoot": "${workspaceFolder}/../",
		"timeout": 1000,
		"sourceMaps": true,
		"smartStep": true,
		"runtimeArgs": [
			"--headless"
		]
	}]
}
```
