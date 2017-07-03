#!/usr/bin/nodejs

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
 * @author     Grégory Saive <greg@evias.be>
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       http://github.com/evias/pacNEM
 */

var app = require('express')(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    path = require('path'),
    handlebars = require("handlebars"),
    expressHbs = require("express-handlebars"),
    auth = require("http-auth"),
    mongoose = require("mongoose"),
    bodyParser = require("body-parser"),
    config = require("config"),
    nem = require("nem-sdk").default,
    i18n = require("i18next"),
    i18nFileSystemBackend = require('i18next-node-fs-backend'),
    i18nMiddleware = require('i18next-express-middleware'),
    fs = require("fs"),
    flash = require("connect-flash"),
    session = require("express-session"),
    validator = require("express-validator");

// internal core dependencies
var logger = require('./core/logger.js');

var __smartfilename = path.basename(__filename);

var serverLog = function(req, msg, type) {
    var logMsg = "[" + type + "] " + msg + " (" + (req.headers ? req.headers['x-forwarded-for'] : "?") + " - " +
        (req.connection ? req.connection.remoteAddress : "?") + " - " +
        (req.socket ? req.socket.remoteAddress : "?") + " - " +
        (req.connection && req.connection.socket ? req.connection.socket.remoteAddress : "?") + ")";
    logger.info(__smartfilename, __line, logMsg);
};

// configure view engine (handlebars)
app.engine(".hbs", expressHbs({
    extname: ".hbs",
    defaultLayout: "default.hbs",
    layoutPath: "views/layouts"
}));
app.set("view engine", "hbs");

// configure translations with i18next
i18n.use(i18nFileSystemBackend)
    .init({
        lng: "en",
        fallbackLng: "en",
        defaultNS: "translation",
        whitelist: ["en", "de", "fr"],
        nonExplicitWhitelist: true,
        preload: ["en", "de", "fr"],
        backend: {
            loadPath: "locales/{{lng}}/{{ns}}.json"
        }
    });

// configure body-parser usage for POST API calls.
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Basic HTTP Authentication
 *
 * COMMENT BLOCK if you wish to open the website
 * to the public.
 */
if (!config.get("pacnem.isPublic", false)) {
    var basicAuth = auth.basic({
        realm: "This is a Highly Secured Area - Monkey at Work.",
        file: __dirname + "/pacnem.htpasswd"
    });
    app.use(auth.connect(basicAuth));
}
/**
 * End Basic HTTP Authentication BLOCK
 */

/**
 * Configure Express Application Middlewares:
 * - flash (connect-flash) notifications helper
 * - session (express-session)
 * - validator (express-validator)
 *
 * Used for Notifications across the game, input validation
 * and cross-request messages.
 */
app.configure(function() {
    app.use(session({
        cookie: { maxAge: 60000 },
        secret: config.get("pacnem.secretKey"),
        resave: false,
        saveUninitialized: false
    }));

    app.use(flash());
    app.use(validator());
});
/**
 * End Application Middlewares
 */

// configure blockchain layer
var blockchain = require('./core/blockchain/service.js');
var PacNEMBlockchain = new blockchain.service(io, nem, logger);

// configure database layer
var models = require('./core/db/models.js');
var PacNEMDB = new models.pacnem(io, PacNEMBlockchain);

// configure our PaymentsCore implementation, handling payment
// processor NEMBot communication
var PaymentsCore = require("./core/blockchain/payments-core.js").PaymentsCore;
var PaymentsProtocol = new PaymentsCore(io, logger, PacNEMBlockchain, PacNEMDB);

var HallOfFameCore = require("./core/blockchain/hall-of-fame.js").HallOfFame;
var HallOfFame = new HallOfFameCore(io, logger, PacNEMBlockchain, PacNEMDB);
HallOfFame.fetchBlockchainHallOfFame();

var PacNEMProtocol = require("./core/pacman/socket.js").PacNEMProtocol;
var PacNEMSockets = new PacNEMProtocol(io, logger, PacNEMBlockchain, PacNEMDB, HallOfFame);

var JobsScheduler = require("./core/scheduler.js").JobsScheduler;
var PacNEM_Crons = new JobsScheduler(logger, PacNEMBlockchain, PacNEMDB);
PacNEM_Crons.hourly();

var PacNEM_Frontend_Config = {
    "business": PacNEMBlockchain.getVendorWallet(),
    "application": PacNEMBlockchain.getPublicWallet(),
    "namespace": PacNEMBlockchain.getNamespace()
};

/**
 * View Engine Customization
 *
 * - handlebars t() helper for template translations handling with i18next
 **/
handlebars.registerHelper('t', function(key, sub) {
    if (typeof sub != "undefined" && sub !== undefined && typeof sub === "string" && sub.length)
    // dynamic subnamespace
        var key = key + "." + sub;

    return new handlebars.SafeString(i18n.t(key));
});

/**
 * Serving static Assets (images, CSS, JS files)
 * @param {*} req 
 * @param {*} res 
 */
var serveStaticFile = function(req, res, path) {
    var file = req.params ? req.params[0] : "";
    if (!file.length)
        return res.send(404);

    // make sure file exists
    var path = __dirname + path + file;
    if (!fs.existsSync(path)) {
        console.log("file: '" + path + "' does not exist");
        return res.send(404);
    }

    return res.sendfile(path);
};

/**
 * Third Party static asset serving
 * - Bootstrap
 * - Handlebars
 * - i18next
 * - jQuery
 */
app.get('/3rdparty/*', function(req, res) {
    return serveStaticFile(req, res, "/www/3rdparty/");
});
app.get('/img/*', function(req, res) {
    return serveStaticFile(req, res, "/img/");
});
app.get('/css/*', function(req, res) {
    return serveStaticFile(req, res, "/www/css/");
});
app.get('/js/*', function(req, res) {
    return serveStaticFile(req, res, "/www/js/");
});

/**
 * Static Files (assets) Serving
 *
 * Also includes asynchronously loaded templates,
 * those are stored in views/partials/*.hbs files.
 */
app.get('/favicon.ico', function(req, res) {
    res.sendfile(__dirname + '/www/favicon.ico');
});

/**
 * - Asynchronous Template Serving
 * - XHR Translations loading
 *
 * The templates present in views/partials can be rendered
 * using the jQFileTemplate frontend implementation.
 */
app.get('/resources/templates/:name', function(req, res) {
        res.sendfile(__dirname + '/views/partials/' + req.params.name + '.hbs');
    })
    .get('/locales/:lang', function(req, res) {
        var json = fs.readFileSync(__dirname + '/locales/' + req.params.lang + '/translation.json');

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.send(json);
    });

/**
 * Frontend Web Application Serving
 *
 * This part of the game is where the end-user is active.
 */
app.get("/sponsor", function(req, res) {
        var currentLanguage = i18n.language;
        var currentNetwork = PacNEMBlockchain.getNetwork();

        var viewData = {
            currentNetwork: currentNetwork,
            currentLanguage: currentLanguage,
            PacNEM_Frontend_Config: PacNEM_Frontend_Config,
            errors: {},
            values: {}
        };

        res.render("sponsor", viewData);
    })
    .post("/sponsor", function(req, res) {
        var currentLanguage = i18n.language;
        var currentNetwork = PacNEMBlockchain.getNetwork();

        var viewData = {
            currentNetwork: currentNetwork,
            currentLanguage: currentLanguage,
            PacNEM_Frontend_Config: PacNEM_Frontend_Config,
            errors: {},
            values: {}
        };

        var mandatoryFieldError = i18n.t("sponsor_engine.error_missing_mandatory_field");

        //XXX SANITIZE

        //req.check("realname", mandatoryFieldError).notEmpty();
        //req.check("email", mandatoryFieldError).notEmpty();
        //req.check("email", mandatoryFieldError).isEmail();
        //req.check("sponsorname", mandatoryFieldError).notEmpty();
        //req.check("type_advertizing", mandatoryFieldError).notEmpty();
        //req.check("description", mandatoryFieldError).notEmpty();

        var input = {
            "realname": req.body.realname,
            "xem": req.body.xem,
            "email": req.body.email,
            "sponsorname": req.body.sponsorname,
            "url": req.body.url,
            "type_advertizing": req.body.type_advertizing,
            "description": req.body.description
        };

        //var errors = req.validationErrors();

        //if (errors) {
        //XXX errors will be indexed by field name

        var errors = {};
        var isFormValid = true;
        var mandatories = ["realname", "xem", "email", "sponsorname", "type_advertizing", "description"];
        for (var i in mandatories) {
            var field = mandatories[i];
            if (!input[field] || !input[field].length) {
                errors[field] = i18n.t("sponsor_engine.error_missing_mandatory_field");
                isFormValid = false;
            }
        }

        if (!isFormValid) {
            viewData["errors"] = errors;
            viewData["values"] = input;
            return res.render("sponsor", viewData);
        }
        //}

        //serverLog(req, JSON.stringify(input), "[DEBUG]");
        //serverLog(req, JSON.stringify(errors), "[DEBUG]");
        //serverLog(req, JSON.stringify(isFormValid), "[DEBUG]");

        // Form input is valid!

        PacNEMDB.NEMSponsor.findOne({ email: input.email }, function(err, sponsor) {
            if (err) {
                // error reading sponsor
                viewData.errors = { general: err };
                return res.render("sponsor", viewData);
            }

            if (sponsor) {
                // sponsor by email already exists!
                viewData.errors = { general: i18n.t("sponsor_engine.error_email_unique") };
                return res.render("sponsor", viewData);
            }

            var sponsorSlug = input.sponsorname.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-');

            sponsor = new PacNEMDB.NEMSponsor({
                slug: sponsorSlug,
                realName: input.realname,
                xem: input.xem.replace(/-/g, ""),
                sponsorName: input.sponsorname,
                email: input.email,
                description: input.description,
                websiteUrl: input.url,
                advertType: input.type_advertizing,
                createdAt: new Date().valueOf()
            });

            sponsor.save(function(err) {
                if (err) {
                    // error saving sponsor
                    viewData.errors = { general: err };
                    return res.render("sponsor", viewData);
                }

                req.flash("info", i18n.t("sponsor_engine.registered_success"));
                return res.redirect("/");
            })
        });
    })
    .get("/:lang", function(req, res) {
        var currentLanguage = req.params.lang;
        var currentNetwork = PacNEMBlockchain.getNetwork();

        i18n.changeLanguage(currentLanguage);

        var notificationMessage = typeof flash("info") == "undefined" ? "" : req.flash("info");

        var viewData = {
            currentNetwork: currentNetwork,
            currentLanguage: currentLanguage,
            PacNEM_Frontend_Config: PacNEM_Frontend_Config,
            notificationMessage: notificationMessage
        };

        res.render("play", viewData);
    })
    .get("/", function(req, res) {
        var currentLanguage = i18n.language;
        var currentNetwork = PacNEMBlockchain.getNetwork();

        var notificationMessage = typeof flash("info") == "undefined" ? "" : req.flash("info");

        var viewData = {
            currentNetwork: currentNetwork,
            currentLanguage: currentLanguage,
            PacNEM_Frontend_Config: PacNEM_Frontend_Config,
            notificationMessage: notificationMessage
        };

        res.render("play", viewData);
    });

/**
 * API Routes
 *
 * Following routes are used for handling the business/data
 * layer.
 *
 * localStorage does not need any API requests to be
 * executed, only the database synchronization needs
 * these API endpoints.
 *
 * The sponsoring feature will also be built using API
 * routes.
 */
app.get("/api/v1/sessions/get", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (!req.query.address || !req.query.address.length)
        return res.send(JSON.stringify({ "status": "error", "message": "Mandatory field `address` is missing." }));

    var input = {
        "xem": req.query.address.replace(/-/g, ""),
        "username": req.query.username,
        "sid": req.query.sid ? req.query.sid : ""
    };

    var keyUsername = input.username.replace(/[\.]/g, "-");
    var keySocketId = input.sid.replace(/[\.]/g, "-");

    // fetch an existing NEMGamer entry by XEM address, this
    PacNEMDB.NEMGamer.findOne({ "xem": input.xem }, function(err, player) {
        if (err) {
            // error mode
            var errorMessage = "Error occured on NEMGamer READ: " + err;

            serverLog(req, errorMessage, "ERROR");
            return res.send(JSON.stringify({ "status": "error", "message": errorMessage }));
        }

        if (!player) {
            // NEMGamer entry not created yet, JiT creation.
            var uname = {}
            uname[keyUsername] = {};
            uname[keyUsername][keySocketId] = true;

            var player = new PacNEMDB.NEMGamer({
                usernames: uname,
                xem: input.xem,
                lastScore: input.score,
                highScore: input.score,
                socketIds: [input.sid],
                countGames: 0,
                createdAt: new Date().valueOf()
            });
        }

        // read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
        PacNEMBlockchain.fetchHeartsByGamer(player);

        // session retrieved.
        return res.send(JSON.stringify({ item: player }));
    });
});

app.post("/api/v1/sessions/store", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var input = {
        "xem": req.body.xem.replace(/-/g, ""),
        "username": req.body.username.replace(/[^A-Za-z0-9\-_\.]/g, ""),
        "score": parseInt(req.body.score),
        "type": req.body.type.replace(/[^a-z0-9\-]/g, ""),
        "sid": req.body.sid.replace(/[^A-Za-z0-9\-_\.#~]/g, ""),
        "validateHearts": parseInt(req.body.validateHearts) === 1
    };

    var keyUsername = input.username.replace(/[\.]/g, "-");
    var keySocketId = input.sid.replace(/[\.]/g, "-");

    // mongoDB model NEMGamer unique on xem address + username pair.
    PacNEMDB.NEMGamer.findOne({ "xem": input.xem }, function(err, player) {
        if (!err && player) {
            // update mode
            var highScore = input.score > player.highScore ? input.score : player.highScore;

            player.xem = input.xem;
            player.lastScore = input.score;
            player.highScore = highScore;
            player.updatedAt = new Date().valueOf();

            if (!player.usernames.hasOwnProperty(keyUsername)) {
                // register new username
                player.usernames[keyUsername] = {};
                player.usernames[keyUsername][keySocketId] = true;
            } else if (!player.usernames[keyUsername].hasOwnProperty(keySocketId)) {
                // save new socket id for existing username
                player.usernames[keyUsername][keySocketId] = true;
            }

            if (!player.socketIds || !player.socketIds.length)
                player.socketIds = [input.sid];
            else {
                var sockets = player.socketIds;
                sockets.push(input.sid);
                player.socketIds = sockets;
            }

            player.save(function(err) {
                if (err) {
                    serverLog(req, "Error ocurred when saving NEMGamer: " + err, "ERROR");
                }
            });

            if (input.validateHearts === true) {
                // read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
                PacNEMBlockchain.fetchHeartsByGamer(player);
            }

            return res.send(JSON.stringify({ item: player }));
        } else if (!player) {
            // creation mode
            var uname = {}
            uname[keyUsername] = {};
            uname[keyUsername][keySocketId] = true;

            var player = new PacNEMDB.NEMGamer({
                usernames: uname,
                xem: input.xem,
                lastScore: input.score,
                highScore: input.score,
                socketIds: [input.sid],
                countGames: 0,
                createdAt: new Date().valueOf()
            });
            player.save(function(err) {
                if (err) {
                    serverLog(req, "Error ocurred when saving NEMGamer: " + err, "ERROR");
                }
            });

            if (input.validateHearts === true) {
                // read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
                PacNEMBlockchain.fetchHeartsByGamer(player);
            }

            return res.send(JSON.stringify({ item: player }));
        } else {
            // error mode
            var errorMessage = "Error occured on NEMGamer update: " + err;

            serverLog(req, errorMessage, "ERROR");
            return res.send(JSON.stringify({ "status": "error", "message": errorMessage }));
        }
    });
});

app.get("/api/v1/scores", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    HallOfFame.fetchBlockchainHallOfFame(null, function(hallOfFame) {
        var ranking = hallOfFame.ranking;
        var scores = [];
        for (var i = 0; i < ranking.length; i++) {
            var rScore = ranking[i];
            var fmtTime = rScore.timestamp.toISOString().replace(/T/, ' ')
                .replace(/\..+/, '');

            scores.push({
                position: i + 1,
                score: rScore.score,
                username: rScore.username,
                address: rScore.address,
                truncAddress: rScore.address.substr(0, 8),
                scoreDate: fmtTime
            });
        }

        res.send(JSON.stringify({ data: scores }));
    });
});

app.get("/api/v1/sponsors/random", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var query = { "isApproved": true };
    var address = req.query.address ? req.query.address : null;
    if (address && address.length)
    //XXX also validate NEM address format
        query["xem"] = address;

    PacNEMDB.NEMSponsor.find(query, function(err, sponsors) {
        if (err) {
            serverLog(req, "Error ocurred when reading NEMSponsor: " + err, "ERROR");
            return res.send(500);
        }

        var cntSponsors = sponsors.length;
        var randomIdx = Math.floor(Math.random() * cntSponsors);
        var randSponsor = sponsors[randomIdx];

        // XXX content per sponsor..
        var content = {
            "type": "image",
            "url": "https://placeholdit.imgix.net/~text?txtsize=47&txt=500%C3%97300&w=500&h=300",
            "isImage": true,
            "isVideo": false
        };

        var response = {
            data: {
                sponsor: randSponsor,
                content: content
            }
        };

        res.send(JSON.stringify(response));
    });
});

app.get("/api/v1/credits/buy", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var amount = parseFloat(config.get("prices.entry"));

    var clientSocketId = req.query.usid ? req.query.usid : null;
    if (!clientSocketId || !clientSocketId.length)
        return res.send(JSON.stringify({ "status": "error", "message": "Mandatory field `Client Socket ID` is invalid." }));

    var invoiceNumber = req.query.num ? req.query.num : null;

    var payer = req.query.payer ? req.query.payer : undefined;
    if (!payer.length || PacNEMDB.isApplicationWallet(payer))
    // cannot be one of the application wallets
        return res.send(JSON.stringify({ "status": "error", "message": "Invalid value for field `payer`." }));

    var recipient = req.query.recipient ? req.query.recipient : config.get("pacnem.business"); // the App's MultiSig wallet
    if (!recipient.length || !PacNEMDB.isApplicationWallet(recipient))
    // must be one of the application wallets
        return res.send(JSON.stringify({ "status": "error", "message": "Invalid value for field `recipient`." }));

    var heartPrice = parseFloat(config.get("prices.heart")); // in XEM
    var receivingHearts = Math.ceil(amount * heartPrice); // XEM price * (1 Heart / x XEM)
    var invoiceAmount = amount * 1000000; // convert amount to micro XEM
    var currentNetwork = PacNEMBlockchain.getNetwork();
    var disableChannel = req.query.chan ? req.query.chan == "0" : false;

    var dbConditions = {
        payerXEM: payer,
        recipientXEM: recipient
    };

    // when no invoiceNumber is given, create or retrieve in following statuses
    dbConditions["status"] = { $in: ["not_paid", "identified", "unconfirmed", "paid_partly", "paid"] };
    if (invoiceNumber && invoiceNumber.length) {
        // load invoice by number
        dbConditions["number"] = decodeURIComponent(invoiceNumber);
        delete dbConditions["status"];
    }

    //serverLog("DEBUG", JSON.stringify(dbConditions), "DEBUG");

    // mongoDB model NEMPaymentChannel unique on xem address + message pair.
    PacNEMDB.NEMPaymentChannel.findOne(dbConditions, function(err, invoice) {
        if (!err && !invoice) {
            // creation mode

            var invoice = new PacNEMDB.NEMPaymentChannel({
                recipientXEM: recipient,
                payerXEM: payer,
                amount: invoiceAmount,
                amountPaid: 0,
                amountUnconfirmed: 0,
                status: "not_paid",
                countHearts: receivingHearts,
                createdAt: new Date().valueOf()
            });
            invoice.save(function(err) {
                PaymentsProtocol.startPaymentChannel(invoice, clientSocketId, function(invoice) {
                    // payment channel created, end create-invoice response.

                    var statusLabelClass = "label-default";
                    var statusLabelIcon = "glyphicon glyphicon-time";

                    if (invoice.isPaid) {
                        statusLabelClass = "label-success";
                        statusLabelIcon = "glyphicon glyphicon-ok";
                    } else if (invoice.status == "paid_partly") {
                        statusLabelClass = "label-info";
                        statusLabelIcon = "glyphicon glyphicon-download-alt";
                    }

                    res.send(JSON.stringify({
                        status: "ok",
                        item: {
                            network: currentNetwork,
                            qrData: invoice.getQRData(),
                            invoice: invoice,
                            statusLabelClass: statusLabelClass,
                            statusLabelIcon: statusLabelIcon
                        }
                    }));
                });
            });

            return false;
        } else if (err) {
            // error mode
            var errorMessage = "Error occured on NEMPaymentChannel update: " + err;

            serverLog(req, errorMessage, "ERROR");
            return res.send(JSON.stringify({ "status": "error", "message": errorMessage }));
        }

        // update mode, invoice already exists, create payment channel proxy

        var statusLabelClass = "label-default";
        var statusLabelIcon = "glyphicon glyphicon-time";

        if (invoice.isPaid) {
            statusLabelClass = "label-success";
            statusLabelIcon = "glyphicon glyphicon-ok";
        } else if (invoice.status == "paid_partly") {
            statusLabelClass = "label-info";
            statusLabelIcon = "glyphicon glyphicon-download-alt";
        }

        if (disableChannel === true) {
            res.send(JSON.stringify({
                status: "ok",
                item: {
                    network: currentNetwork,
                    qrData: invoice.getQRData(),
                    invoice: invoice,
                    statusLabelClass: statusLabelClass,
                    statusLabelIcon: statusLabelIcon
                }
            }));
        } else {
            PaymentsProtocol.startPaymentChannel(invoice, clientSocketId, function(invoice) {
                // payment channel created, end create-invoice response.

                res.send(JSON.stringify({
                    status: "ok",
                    item: {
                        network: currentNetwork,
                        qrData: invoice.getQRData(),
                        invoice: invoice,
                        statusLabelClass: statusLabelClass,
                        statusLabelIcon: statusLabelIcon
                    }
                }));
            });
        }
    });
});

app.get("/api/v1/credits/history", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var payer = req.query.payer ? req.query.payer : undefined;
    var number = req.query.number ? req.query.number : undefined;

    if (!payer || !payer.length || PacNEMDB.isApplicationWallet(payer))
    // cannot be one of the application wallets
        return res.send(JSON.stringify({ "status": "error", "message": "Invalid value for field `payer`." }));

    var invoiceQuery = {
        payerXEM: payer,
        status: {
            $in: ["not_paid",
                "expired",
                "unconfirmed",
                "paid_partly",
                "paid"
            ]
        }
    };

    if (number && number.length) {
        invoiceQuery["number"] = number;
    }

    PacNEMDB.NEMPaymentChannel.find(invoiceQuery, function(err, invoices) {
        if (err) {
            var errorMessage = "Error occured on /credits/history: " + err;
            serverLog(req, errorMessage, "ERROR");
            return res.send(JSON.stringify({ "status": "error", "message": errorMessage }));
        }

        if (!invoices || !invoices.length)
            return res.send(JSON.stringify({ "status": "ok", data: [] }));

        // VERIFY all invoices state and amounts by iterating blockchain
        // transactions. This ensure that we never send a wrong Invoice State
        // through this API - it will always be validated by blockchain data.
        PaymentsProtocol.fetchInvoicesRealHistory(invoices, null, function(invoicesHistory) {
            if (invoicesHistory === false)
                return res.send(JSON.stringify({ "status": "ok", data: [] }));

            // return list of invoices
            var invoicesData = [];
            for (var num in invoicesHistory) {
                var currentInvoice = invoicesHistory[num].invoice;

                var statusLabelClass = "label-default";
                var statusLabelIcon = "glyphicon glyphicon-time";

                if (currentInvoice.isPaid) {
                    statusLabelClass = "label-success";
                    statusLabelIcon = "glyphicon glyphicon-ok";
                } else if (currentInvoice.status == "paid_partly") {
                    statusLabelClass = "label-info";
                    statusLabelIcon = "glyphicon glyphicon-download-alt";
                }

                var fmtCreatedAt = new Date(currentInvoice.createdAt).toISOString().replace(/T/, ' ').replace(/\..+/, '');
                var fmtUpdatedAt = new Date(currentInvoice.createdAt).toISOString().replace(/T/, ' ').replace(/\..+/, '');

                invoicesData.push({
                    number: currentInvoice.number,
                    recipient: currentInvoice.recipientXEM,
                    truncRecipient: currentInvoice.getTruncatedRecipient(),
                    amount: (currentInvoice.amount),
                    amountPaid: (currentInvoice.amountPaid),
                    amountFmt: (currentInvoice.amount / Math.pow(10, 6)),
                    amountPaidFmt: (currentInvoice.amountPaid / Math.pow(10, 6)),
                    status: currentInvoice.status,
                    createdAt: fmtCreatedAt,
                    updatedAt: fmtUpdatedAt,
                    statusLabelClass: statusLabelClass,
                    statusLabelIcon: statusLabelIcon
                });
            }

            if (number && number.length && invoicesData.length === 1)
            // single invoice data
                return res.send(JSON.stringify({ "status": "ok", item: invoicesData.pop() }));

            return res.send(JSON.stringify({ "status": "ok", data: invoicesData }));
        });
    });
});

app.get("/api/v1/credits/remaining", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var payer = req.query.payer ? req.query.payer : undefined;
    if (!payer.length || PacNEMDB.isApplicationWallet(payer))
    // cannot be one of the application wallets
        return res.send(JSON.stringify({ "status": "error", "message": "Invalid value for field `payer`." }));

    // fetch an existing NEMGamer entry by XEM address, this
    PacNEMDB.NEMGamer.findOne({ "xem": payer }, function(err, player) {
        if (err || !player) {
            // never played before

            return res.send(JSON.stringify({
                status: "ok",
                item: 0
            }));
        }

        // get a "last credit state from db"
        player.credits(function(err, credit) {
            var remaining = 0;

            if (!err && credit) {
                remaining = credit.getCountRemaining();
            }

            res.send(JSON.stringify({
                status: "ok",
                item: remaining
            }));
        });
    });
});

app.get("/api/v1/lounge/get", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var lounge = PacNEMSockets.getRoomManager().toDict();
    var allMosaics = PacNEMBlockchain.getGameMosaicsConfiguration();
    var namespace = PacNEMBlockchain.getNamespace();

    var totalSessions = Object.getOwnPropertyNames(lounge.players).length;
    var loungeSessions = 0;
    var playingSessions = 0;

    for (var rId in lounge.rooms) {
        var currentRoom = lounge.rooms[rId];
        var cntMembers = Object.getOwnPropertyNames(currentRoom.toDictionary().usernames).length;

        //DEBUG console.log("[DEBUG] [API] [ROOMS] currentRoom: " + JSON.stringify(currentRoom.toDictionary()));

        var status = currentRoom.getStatus();
        if (status === "play" || status === "wait") {
            playingSessions += cntMembers;
        }
    }

    loungeSessions = totalSessions - playingSessions;
    var loungeData = {
        "details": lounge,
        "lounge": {
            "sessions": {
                "total": totalSessions || 0,
                "lounge": loungeSessions || 0,
                "playing": playingSessions || 0
            },
            "mosaics": allMosaics
        }
    };

    res.send(JSON.stringify({ "status": "ok", "data": loungeData }));
});

app.get("/api/v1/reset", function(req, res) {
    res.setHeader('Content-Type', 'application/json');

    var canResetData = process.env["ALLOW_DB_RESET"] == 1 || config.get("pacnem.canResetData", false);
    if (!canResetData || canResetData !== true)
        return res.send(JSON.stringify({ "status": "error", "error": "Feature disabled" }));

    // remove all data..
    PacNEMDB.NEMGameCredit.find({}).remove(function(err) {});
    PacNEMDB.NEMGamer.find({}).remove(function(err) {});
    PacNEMDB.NEMSponsor.find({}).remove(function(err) {});
    PacNEMDB.NEMGame.find({}).remove(function(err) {});
    PacNEMDB.NEMPaymentChannel.find({}).remove(function(err) {});
    PacNEMDB.NEMAppsPayout.find({}).remove(function(err) {});
    PacNEMDB.NEMBot.find({}).remove(function(err) {});
    PacNEMDB.NEMReward.find({}).remove(function(err) {});

    return res.send(JSON.stringify({ "status": "ok" }));
});

/**
 * Now listen for connections on the Web Server.
 *
 * This starts the NodeJS server and makes the Game
 * available from the Browser.
 */
var port = process.env['PORT'] = process.env.PORT || 2908;
server.listen(port, function() {
    var network = PacNEMBlockchain.getNetwork();
    var blockchain = network.isTest ? "Testnet Blockchain" : network.isMijin ? "Mijin Private Blockchain" : "NEM Mainnet Public Blockchain";
    var vendor = PacNEMBlockchain.getVendorWallet();
    var application = PacNEMBlockchain.getPublicWallet();
    var namespace = PacNEMBlockchain.getNamespace();

    console.log("------------------------------------------------------------------------");
    console.log("--                       PacNEM Blockchain Game                       --");
    console.log("--                                                                    --");
    console.log("--           Autonomous Game project using the NEM Blockchain         --")
    console.log("------------------------------------------------------------------------");
    console.log("-");
    console.log("- PacNEM Game Server listening on Port %d in %s mode", this.address().port, app.settings.env);
    console.log("- PacNEM Game is using blockchain: " + blockchain);
    console.log("- PacNEM Vendor Wallet is: " + vendor);
    console.log("- PacNEM Application Wallet is: " + application);
    console.log("- PacNEM is using Namespace: " + namespace);
    console.log("-")
    console.log("------------------------------------------------------------------------");
});