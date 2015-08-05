'use strict';
var rc_util = require('rippled-network-crawler/src/lib/utility.js');
var modelsFactory = require('rippled-network-crawler/src/lib/models.js');
var DB = require('rippled-network-crawler/src/lib/database');
var Promise = require('bluebird');
var graphite = require('graphite');
var _ = require('lodash');
var graphiteClient;

function getLatestCrawl(dbUrl, logsql) {
  return new Promise(function(resolve, reject) {
    var log = logsql ? console.log : false;
    var sql = DB.initSql(dbUrl, log);

    var model = modelsFactory(sql);

    model.Crawl.findOne({
      order: [
        ['id', 'DESC']
      ]
    }).then(function(crawl) {
      if (!crawl) {
        return reject(new Error('No crawls in database'));
      }
      return resolve(crawl.dataValues);
    }).catch(function(error) {
      return reject(error);
    });
  });
}

function writeToGraphite(crawl) {
  var metrics = {
    crawler: {
      ippCount: rc_util.getIpps(crawl).length,
      publicKeyCount: Object.keys(rc_util.getRippleds(crawl)).length,
      connectionsCount: Object.keys(rc_util.getLinks(crawl)).length,
      rippleds: {}
    }
  };
  var rippleds = rc_util.getRippledsC(crawl);
  _.each( Object.keys(rippleds), function (rippled) {
    metrics.crawler.rippleds[rippled] = {
      connectionsCount: rippleds[rippled].in + rippleds[rippled].out
    }
  })

  graphiteClient.write(metrics, function(err) {
    if (err) {
      console.error(err);
    }
  });
}

function recReport(lastId, dbUrl, logsql) {
  getLatestCrawl(dbUrl, logsql).then(function(latestCrawl) {
    if (lastId < latestCrawl.id) {
      writeToGraphite(latestCrawl.data);
      lastId = latestCrawl.id;
      console.log('wrote crawl', lastId, 'to graphite' );
    }
    recReport(lastId, dbUrl, logsql);
  });
}

module.exports = function(dbUrl, graphiteUrl, commander) {
  return new Promise(function(resolve, reject) {
    var logsql = false;
    graphiteClient = graphite.createClient(graphiteUrl);
    recReport(-1, dbUrl, logsql);
  });
};