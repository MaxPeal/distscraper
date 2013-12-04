var repl = require('repl');
var fs = require('fs');
var async = require('async');
var path = require('path');
var request = require('./request');
var program = require('commander');

var scrapers = [];

function includeDirectory(directoryPath) {
	fs.readdirSync(directoryPath).map(function(scraperName) {
		return path.join(directoryPath,scraperName);
	}).forEach(includeScraper);
}

function includeScraper(scraperPath) {
	var scraper = require('./' + scraperPath);
	scraper.path = scraperPath;
	scrapers.push(scraper);
}

program
	.option('-d, --directory <path>', 'Include directory of scrapers',includeDirectory)
	.option('-s, --scraper <path>', 'Include specific scraper',includeScraper)
	.option('-o, --output <outputdir>', 'Output directory','out')
	.option('-n, --nonhuman', 'Don\'t show the status of scrapers interactively')
	.parse(process.argv);


var charm;
// Enable charm is there is an TTY
if (process.stdout.isTTY && !program.nonhuman) {
	charm = require('charm')();
	charm.pipe(process.stdout);
	charm.reset();
} else {
	charm = null;
}

if (!program.directory || !program.scraper) {
	includeDirectory('scrapers');
}

var repositoryDefinitions = [
	{
		name: 'main',
		filter: function(distribution) { return distribution.tags.indexOf('hybrid') >= 0; }
	},
	{
		name: 'nonhybrid',
		filter: function(distribution) { return distribution.tags.indexOf('nonhybrid') >= 0; }
	}
];

var statusOffset = 0;

function showScrapers(scrapers) {
	var i;
	if (charm) {
		statusOffset = 0;
		for(i=0;i<scrapers.length;i++) {
			scrapers[i].index = i;
			charm.push();
			charm.write(scrapers[i].path);
			charm.pop();
			charm.down(1);
			statusOffset = Math.max(statusOffset, scrapers[i].path.length);
		}
	} else {
		for(i=0;i<scrapers.length;i++) {
			showScraperStatus(scrapers[i].path,'starting');
		}
	}
}

function showScraperStatus(scraper,status) {
	if (charm) {
		charm.push();
		charm.up(scrapers.length-scraper.index);
		charm.right(statusOffset+1);
		charm.erase('end');
		charm.write(status);
		charm.pop();
	} else {
		console.log(scraper.path,':',status);
	}
}

function scrape(scrapers,callback) {
	showScrapers(scrapers);
	async.map(scrapers,function(scraper,callback) {
		showScraperStatus(scraper,'working');
		scraper(request,function(err,result) {
			if (err) {
				showScraperStatus(scraper,'error ('+err+')');
			} else {
				showScraperStatus(scraper,'done ('+result.length+' results)');
			}
		});
	},callback);
}

scrape(scrapers, function(err,distributions) {
	if (err) { console.error(err); throw err; }

	var errors = validateDistributions(distributions);
	if (errors.length > 0) {
		console.error(errors);
		process.exit(1);
		return;
	}

	var repositories = repositoryDefinitions.map(function(repositoryDefinition) {
		return {
			name: repositoryDefinition.name,
			distributions: distributions.filter(repositoryDefinition.filter.bind(repositoryDefinition))
		};
	});

	async.forEach(repositories, function(repository,cb) {
		var repositoryPath = path.join(program.output, repository.name + '.json');
		fs.writeFile(repositoryPath, JSON.stringify(repository.distributions), cb);
	},function(err) {
		if (err) {
			console.error(err);
			process.exit(1);
			return;
		}
		process.exit(0);
	});
});

function validateDistributions(distributions) {
	var errors = [];
	distributions.forEach(function(distro) {
		errors.concat(validateDistribution(distro));
	});
	return errors;
}

function validateDistribution(distro) {
	var errors = [];
	function pushError(description) { errors.push({distribution: distro.id, description: description}); }

	try {
		if (!distro.id) { pushError('No id for distro'); }
		if (!distro.name) { pushError('No name for distro'); }
		if (!distro.url) { pushError('No website for distro'); }
		if (distro.releases.length === 0) {
			pushError('No releases');
		}
		distro.releases.forEach(function(release) {
			if (!release) { pushError('Release is null'); return; }
			if (typeof release !== 'object') { pushError('Release is not an object'); return; }
			if (!release.url) { pushError('Release does not have an url'); }
			if (!release.size) { pushError('Release "'+release.url+'" does not have a size'); }
			if (!release.version) { pushError('Release "'+release.url+'" does not have an version'); }
			if (!/^http:\/\//.test(release.url)) { pushError('Release "'+release.url+'" is not an url'); }
			if (/\s+/.test(release.url)) { pushError('Release "'+release.url+'" has whitespace in its url'); }
			if (distro.releases.filter(function(o) { return o && o.url === release.url; }).length > 1) { pushError('Duplicate url "'+release.url+'".'); }
		});
	} catch (e) {
		pushError('Exception while validating: "' + e + '".');
	}
	return errors;
}


