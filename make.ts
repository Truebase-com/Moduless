/// <reference types="makets" />

make.on("bundle", "publish", () =>
{
	make.copy("./build/index.js", "./bundle/index.js");
});

make.on("publish", () =>
{
	make.publish({
		//bin: 
	});
});
