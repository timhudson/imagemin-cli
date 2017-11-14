#!/usr/bin/env node
'use strict';
const path = require('path');
const arrify = require('arrify');
const meow = require('meow');
const getStdin = require('get-stdin');
const globby = require('globby');
const imagemin = require('imagemin');
const ora = require('ora');
const plur = require('plur');
const stripIndent = require('strip-indent');

const cli = meow(`
	Usage
	  $ imagemin <path|glob> ... --out-dir=build [--plugin=<name> ...]
	  $ imagemin <file> > <output>
	  $ cat <file> | imagemin > <output>

	Options
	  -p, --plugin   Override the default plugins
	  -o, --out-dir  Output directory
		-w, --write    Edit files in-place. (Beware!)

	Examples
	  $ imagemin images/* --out-dir=build
	  $ imagemin foo.png > foo-optimized.png
	  $ cat foo.png | imagemin > foo-optimized.png
	  $ imagemin --plugin=pngquant foo.png > foo-optimized.png
		$ imagemin **/*.{jpg,png} --write
`, {
	string: [
		'plugin',
		'out-dir'
	],
	boolean: [
		'write'
	],
	alias: {
		p: 'plugin',
		o: 'out-dir',
		w: 'write'
	}
});

const DEFAULT_PLUGINS = [
	'gifsicle',
	'jpegtran',
	'optipng',
	'svgo'
];

const requirePlugins = plugins => plugins.map(x => {
	try {
		return require(`imagemin-${x}`)();
	} catch (err) {
		console.error(stripIndent(`
			Unknown plugin: ${x}

			Did you forget to install the plugin?
			You can install it with:

			  $ npm install -g imagemin-${x}
		`).trim());
		process.exit(1);
	}
});

const run = (input, opts) => {
	opts = Object.assign({plugin: DEFAULT_PLUGINS}, opts);

	const use = requirePlugins(arrify(opts.plugin));
	const spinner = ora('Minifying images');

	if (Buffer.isBuffer(input)) {
		imagemin.buffer(input, {use}).then(buf => process.stdout.write(buf));
		return;
	}

	if (opts.outDir || opts.write) {
		spinner.start();
	}

	const runAll = !opts.write ? runSingle(input, opts) : (
		globby(input, {nodir: true})
			.then(paths => {
				return Promise.all(paths.map(x => runSingle([x], { outDir: path.dirname(x) }, use)));
			})
	).then(results => Array.isArray(results) ? results : [results]);

	runAll
		.then((results) => {
			spinner.stop();
			console.log(`${results.length} ${plur('image', results.length)} minified`);
		})
		.catch(err => {
			spinner.stop();
			throw err;
		});

	if (opts.write) {
	} else {
		runSingle(input, opts);
	}

	function runSingle(input, opts) {
		return imagemin(input, opts.outDir, {use})
		.then(files => {
			if (!opts.outDir && files.length === 0) {
				return;
			}

			if (!opts.outDir && files.length > 1) {
				console.error('Cannot write multiple files to stdout, specify a `--out-dir`');
				process.exit(1);
			}

			if (!opts.outDir) {
				process.stdout.write(files[0].data);
				return;
			}
		})
	}
};

if (!cli.input.length && process.stdin.isTTY) {
	console.error('Specify at least one filename');
	process.exit(1);
}

if (cli.input.length) {
	run(cli.input, cli.flags);
} else {
	getStdin.buffer().then(buf => run(buf, cli.flags));
}
