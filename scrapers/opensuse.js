var async = require('async');
var sugar = require('sugar');

function first(a) { return a[1]; }
module.exports = function(request,callback) {
	var distributionurl = 'http://download.opensuse.org/distribution/';
	request.dom(distributionurl,function(err,$) {
		var versions = $('pre a').map(function(a) {
			return (/^(\d+(\.\d+)+)\/$/).exec(a.attr('href'));
		}).compact().map(first);
		var distribution = {
			id: 'opensuse',
			name: 'OpenSUSE',
			tags: ['hybrid'],
			url: 'http://www.opensuse.org/'
		};

		async.map(versions,function(version,callback) {
			var isosurl = distributionurl+version+'/iso/';
			request.dom(isosurl,function(err,$) {
				if (err) { return callback(err); }
				var releases = $('pre a').map(function(a) {
					return a.attr('href');
				}).compact().filter(function(filename) {
					return (/\.iso$/).test(filename);
				}).compact().map(function(filename) {
					return {version: version,url:isosurl+filename};
				});
				async.map(releases,function(release,callback) {
					request.contentlength(release.url,function(err,contentlength) {
						if (err) { return callback(err); }
						release.size = contentlength;
						callback(null,release);
					});
				},callback);
			});
		},function(err,releases) {
			distribution.releases = releases.flatten();
			callback(null,distribution);
		});
	});
};

