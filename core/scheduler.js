/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */

(function() {

var config  = require("config");
var CronJob = require("cron").CronJob;

/**
 * class JobsScheduler provides with a mechanism for executing
 * daily/hourly cron jobs using node-cron.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var JobsScheduler = function(logger, chainDataLayer, dataLayer)
{
    this.blockchain_ = chainDataLayer;
    this.logger = logger;
    this.db_    = dataLayer;
    this.crons  = {"daily": {}, "hourly": {}};

    this.daily = function()
    {
        var self = this;
    };

    this.hourly = function()
    {
        var self = this;
        var hourly_PaymentExpiration = new CronJob('00 00 * * * *',
            function() {
                self._processPaymentsExpiration();
            },
            function () {
                //XXX print results with logger.
            },
            false,
            "Europe/Amsterdam"
        );

        this.crons["hourly"]["PaymentExpiration"] = hourly_PaymentExpiration;
    };

    this._processPaymentsStatusUpdates = function()
    {

    };

    this._processPaymentsExpiration = function()
    {
        var self = this;
    };
};

module.exports.JobsScheduler = JobsScheduler;
}());
