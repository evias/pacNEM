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

    var config = require("config");
    var CronJob = require("cron").CronJob;

    /**
     * class JobsScheduler provides with a mechanism for executing
     * daily/hourly cron jobs using node-cron.
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var JobsScheduler = function(logger, chainDataLayer, dataLayer, gameCredits) {
        this.blockchain_ = chainDataLayer;
        this.logger = logger;
        this.db_ = dataLayer;
        this.credits_ = gameCredits;
        this.crons = { "daily": {}, "hourly": {} };

        this.daily = function() {
            var self = this;
        };

        this.hourly = function() {
            var self = this;

            self.logger.info("[JOBS]", "[SCHEDULE]", "Scheduling hourly PaymentExpiration Job execution");

            var hourly_PaymentExpiration = new CronJob('00 00 * * * *',
                function() {
                    self._processPaymentsExpiration(function(result, err) {
                        if (!err)
                            self.logger.info("[NEM] [PAYMENT]", "[EXPIRE]", "Expired " + result + " Payment Channels");
                        else
                            self.logger.error("[NEM] [PAYMENT]", "[EXPIRE]", "Error on Payments Expiration: " + err);
                    });
                },
                function() {
                    //XXX print results with logger.
                },
                false,
                "Europe/Amsterdam"
            );

            var hourly_MosaicsSeen = new CronJob('00 00 * * * *',
                function() {
                    self.fetchHourlySeenMosaics(function(err, result) {
                        if (!err)
                            self.logger.info("[NEM] [LOUNGE]", "[FETCH]", "Seen Mosaics: " + JSON.stringify(result));
                        else
                            self.logger.error("[NEM] [LOUNGE]", "[FETCH]", "Error on Hourly Mosaic fetch: " + err);
                    });
                },
                function() {
                    //XXX print results with logger.
                },
                false,
                "Europe/Amsterdam"
            );

            this.crons["hourly"]["PaymentExpiration"] = hourly_PaymentExpiration;
            this.crons["hourly"]["MosaicsSeen"] = hourly_MosaicsSeen;
        };

        /**
         * This cron is destined to expire invoices which are 2 days old
         * and have received 0 XEM. Expiring such invoices will make sure
         * that Players can't keep invoices standing for months while the
         * Entry Price of the Game changes (Rate Security).
         *
         * @param  {Function} callback
         * @return boolean
         */
        this._processPaymentsExpiration = function(callback) {
            var self = this;

            // must only expire 0 amounts invoices!
            self.db_.NEMPaymentChannel.find({ "amountPaid": 0, "amountUnconfirmed": 0 }, function(err, invoices) {
                if (err || !invoices) {
                    // error mode
                    var errorMessage = "Error occured on NEMPaymentChannel READ: " + err;

                    serverLog(req, errorMessage, "ERROR");
                    return callback(0, errorMessage);
                }

                if (!invoices.length)
                    return callback(0);

                var cntExpired = 0;
                for (var i = 0; i < invoices.length; i++) {
                    var invoice = invoices[i];
                    var twoDaysAgo = new Date().valueOf() - (48 * 60 * 60 * 1000);

                    if (invoice.createdAt < oneHourAgo) {
                        // invoice is more than 2 days old without paid amount - expiration here.
                        invoice.status = "expired";
                        invoice.save();
                        cntExpired++;
                    }
                }

                return callback(cntExpired);
            });

            return true;
        };

        /**
         * This cron *reads* the blockchain for *mosaics* of players that
         * have visited PacNEM today.
         *
         * @param  {Function} callback
         * @return boolean
         */
        this.fetchHourlySeenMosaics = function(callback) {
            var self = this;

            var startDay = new Date();
            var endDay = new Date();
            var tsStart = startDay.setHours(0, 0, 0, 0);
            var tsEnd = endDay.setHours(23, 59, 59, 999);

            //self.logger.info("[NEM] [LOUNGE]", "[FETCH]", "Now fetching seen Mosaics");

            var daySlug = startDay.toJSON().replace(/T.*$/, '');

            self.db_.PacNEMClientSession.find({
                createdAt: { $gt: tsStart, $lt: tsEnd }
            }, function(err, sessions) {
                // for each authenticated session of the day, check for
                // available mosaics to report on the lounge

                if (err || !sessions || !sessions.length) {
                    return (typeof callback == "function" ? callback([]) : null);
                }

                self.credits_.saveSessionsMosaics(sessions, daySlug, null, {}, function(dailyStack) {
                    self.logger.info("[NEM] [LOUNGE]", "[FETCH]", "Daily Mosaics Read: " + JSON.stringify(dailyStack));
                });
            });

            return true;
        };
    };

    module.exports.JobsScheduler = JobsScheduler;
}());