/// <reference types="makets" />

make.on("bundle", "publish", async () =>
{
	await make.typescript(".");
	make.copy("./build/index.js", "./bundle/index.js");
	make.copy("./readme.md", "./bundle/readme.md");
	make.executable({
		file: "./bundle/index.js"
	});
});

make.on("publish", () =>
{
	make.publish({
		packageFileChanges: {
			bin: {
				moduless: "./index.js"
			}
		},
		registries: ["https://registry.npmjs.org"]
	});
});
