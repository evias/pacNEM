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

    var config = require("config"),
        path = require('path'),
        CryptoJS = require("crypto-js");

    var __smartfilename = path.basename(__filename);
    var NEMBot_for_pacNEM = {
        "paymentBot": { host: process.env["PAYMENT_BOT_HOST"] || config.get("pacnem.bots.paymentBot") }
    };

    var botChannelSockets_ = {};

    /**
     * class PaymentsCore provides a business layer for
     * payments management features. (Invoices, Payment updates, etc.)
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var PaymentsCore = function(io, logger, chainDataLayer, dataLayer, credits, auth) {
        this.socketIO_ = io;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;
        this.credits_ = credits;
        this.auth_ = auth;

        this.logger_ = logger;

        var paymentTransactionHistory_ = { byInvoice: {}, byHash: {} };
        var incomingStatusUpdates_ = { byChecksum: {} };

        /**
         * The startPaymentChannel function is used to open the communication
         * channel between this backend and the NEMBot responsible for Payment
         * Processing of the pacNEM game invoices.
         *
         * This function will emit `pacnem_payment_status_update` to `clientSocketId`
         * in case the NEMBot sends a payment update to this backend (through
         * the previously created communication channel).
         *
         * @param  {NEMPaymentChannel}   invoice
         * @param  {string}   clientSocketId  - Frontend SocketIO socket ID (Frontend to Backend communication)
         * @param  {Function} callback       [description]
         * @return {void}
         */
        this.startPaymentChannel = function(invoice, clientSocketId, callback) {
            var self = this;
            // Now the BACKEND will subscribe to a direct channel to the NEMBot responsible
            // for Payment Reception Listening. Here we will link the BACKEND SOCKET ID
            // with the CLIENT SOCKET ID. The client should never request directly to the
            // NEMBot, so we proxy the whole event chain to avoid this.

            // First we emit a `nembot_open_payment_channel` with the given invoice NUMBER and payer XEM address.
            // Then we register a listener on `nembot_payment_status_update` which will be triggered when a
            // Transaction with MESSAGE being the invoiceNumber OR SENDER PUBLIC KEY being the payerXEM, is received
            // (/unconfirmed &  /transactions). When the transaction is included in a block, another event
            // will be triggered (`nembot_payment_status_update` again) with status `completed`, this time.
            // Only the second call with completed status should be trusted as a paid amount for the invoice.

            var socket = require("socket.io-client");
            var channelSocket = socket.connect(NEMBot_for_pacNEM.paymentBot.host);

            //XXX channelParams should allow defining a payment Mosaic
            //    this will allow payments with different mosaics than XEM.
            var channelParams = {
                message: invoice.number,
                sender: invoice.payerXEM,
                recipient: invoice.recipientXEM,
                amount: invoice.amount,
                maxDuration: 5 * 60 * 1000
            };

            self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", '[BOT] open_channel(' + JSON.stringify(channelParams) + ') with NEMBot host: ' + NEMBot_for_pacNEM.paymentBot.host);
            channelSocket.emit("nembot_open_payment_channel", JSON.stringify(channelParams));

            // configure payment status update event FORWARDING (comes from NEMBot and forwards to Frontend)
            channelSocket.on("nembot_payment_status_update", function(rawdata) {

                // build status update checksum to be sure we process websockets
                // status updates only once.
                var payload = rawdata;
                var uaStatus = CryptoJS.lib.WordArray.create(payload);
                var checksum = CryptoJS.MD5(uaStatus).toString();

                if (incomingStatusUpdates_.byChecksum.hasOwnProperty(checksum))
                // already forwarded
                    return false;

                // status update must be forwarded

                self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", '[BOT] [' + channelSocket.id + '] nembot_payment_status_update(' + rawdata + ')');

                // parse websocket data and store
                var data = JSON.parse(rawdata);
                incomingStatusUpdates_.byChecksum[checksum] = data;

                // forward to client..
                var clientData = {
                    status: data.status,
                    paymentData: data
                };
                io.sockets.to(clientSocketId)
                    .emit("pacnem_payment_status_update", JSON.stringify(clientData));

                // do the UI magic
                self.storeInvoiceStatusUpdate(data);
            });

            // save new backend socket ID to invoice.
            if (!invoice.socketIds || !invoice.socketIds.length)
                invoice.socketIds = [channelSocket.id];
            else {
                var sockets = invoice.socketIds;
                sockets.push(channelSocket.id);

                invoice.socketIds = sockets;
            }

            if (!botChannelSockets_.hasOwnProperty(invoice.number))
                botChannelSockets_[invoice.number] = [];

            botChannelSockets_[invoice.number].push({ socket: channelSocket, clientId: clientSocketId });

            invoice.save(function(err) {
                callback(invoice);
            });
        };

        /**
         * This function saves an invoice status update to the
         * database. It helps keeping track of the payment states.
         *
         * When the data is saved to the database, a custom callback
         * will be executed to send a transaction using our pacNEM
         * Multi Signature Account so that the the buyer receives
         * the bought evias.pacnem:heart Mosaics.
         *
         * @param  {object} data
         * @return {void}
         */
        this.storeInvoiceStatusUpdate = function(data) {
            var self = this;
            var invoiceQuery = {};

            if (typeof data.message != 'undefined' && data.message.length) {
                // Player sent message along with transaction.
                invoiceQuery["number"] = data.message;
            } else if (typeof data.sender != 'undefined' && data.sender.length) {
                // Player didn't send a Message with the transaction..
                invoiceQuery["payerXEM"] = data.sender;
            }

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", 'Fetching invoice with query: ' + JSON.stringify(invoiceQuery));

            // find invoice and update status and amounts
            self.db_.NEMPaymentChannel.findOne(invoiceQuery, function(err, invoice) {
                if (err || !invoice) {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", 'No Invoice found: ' + JSON.stringify(invoiceQuery));
                    return false;
                }

                invoice.status = data.status;

                if (data.status == "unconfirmed")
                    invoice.amountUnconfirmed = data.amountUnconfirmed;
                else if (data.amountPaid)
                    invoice.amountPaid = data.amountPaid;

                if (data.status == "paid") {
                    invoice.isPaid = true;
                    invoice.paidAt = new Date().valueOf();
                }

                invoice.save(function(err) {
                    if (err) {
                        self.logger_.error(__smartfilename, __line, '[ERROR] Invoice status update error: ' + err);
                        return false;
                    }

                    if (data.status != "paid" && data.status != "unconfirmed")
                        return false;

                    if (invoice.hasSentHearts === true && invoice.heartsTransactionHash)
                        return false;

                    if (!invoice.isPaid || invoice.getTotalIncoming() < invoice.amount)
                        return false;

                    // coming here means INVOICE PAID

                    self.db_.NEMAppsPayout.findOne({ xem: data.sender, reference: invoice.number }, function(err, payout) {
                        if (err) {
                            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", 'No Invoice found: ' + err);
                            return false;
                        }
                        if (payout) {
                            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", 'Payout already done: ' + JSON.stringify(payout));
                            return false;
                        }

                        invoice.hasSentHearts = true;
                        invoice.save();

                        var creation = new self.db_.NEMAppsPayout({
                            xem: data.sender,
                            reference: invoice.number,
                            createdAt: new Date().valueOf()
                        });
                        creation.save(function(err) {

                            // only send hearts in case it was not done before.

                            self.processPaymentChannelSuccess(invoice);
                        });
                    });

                });
            });
        };

        /**
         * This method is used when a PaymentChannel *is finalized*.
         * This means that the Invoice *has been paid completely* and
         * will send the corresponding hearts Mosaics to the Payer of
         * the Invoice.
         *
         * This method will also broadcast a Socket.IO event for the Frontend
         * such that the Payment Status Update can be processed on the Invoice
         * View.
         * 
         * Additionally, the Personal Token for the Player will be sent
         * on the NEM Blockchain with the Authenticator class.
         *
         * @param   {NEMPaymentChannel}     paymentChannel
         */
        this.processPaymentChannelSuccess = function(paymentChannel) {
            var self = this;

            // send Game Credits now that Invoice is paid
            self.credits_.sendHeartsForPayment(paymentChannel, function(paymentChannel) {
                // forward "DONE PAYMENT" to client..
                var clientData = {
                    status: paymentChannel.status,
                    number: paymentChannel.number
                };

                if (botChannelSockets_.hasOwnProperty(paymentChannel.number)) {
                    //var clientSocketId = botChannelSockets_[paymentChannel.number].clientId;
                    var socketsForPayment = botChannelSockets_[paymentChannel.number];

                    for (var i in socketsForPayment)
                        self.socketIO_.sockets.to(socketsForPayment[i].clientId)
                        .emit("pacnem_payment_success", JSON.stringify(clientData));
                }
            });

            // and send the Personal Token to the Player in case none 
            // is found on the blockchain yet.
            self.auth_.fetchPersonalTokens(null, function(tokensData) {
                // check whether we already have a token for this user, then
                // we should not send one again! Blockchain Validition done.

                var player = paymentChannel.payerXEM.replace(/-/g, '');
                if (tokensData.tokens.hasOwnProperty(player)) {
                    return false;
                }

                // safely send authentication code, none ever sent to user.
                self.auth_.sendPersonalToken(player);
            });
        };

        /**
         * This method reads blockchain transactions to validate
         * invoice entries. It will send Payment Status Updates
         * in case the paymentChannel object must be updated.
         *
         * Invoices in the `invoices` Array should be passed
         * NEMPaymentChannel instances loaded from mongoose.
         *
         * @param   {Array}     invoices    Should contain {NEMPaymentChannel} objects
         */
        this.fetchInvoicesRealHistory = function(invoices, lastTrxRead, callback) {
            var self = this;

            if (!invoices.length)
                return callback(false);

            var numbers = {};
            var invoiceByNumber = {};
            for (var i = 0; i < invoices.length; i++) {
                var num = invoices[i].number.toUpperCase();
                if (!paymentTransactionHistory_.byInvoice.hasOwnProperty(num)) {
                    paymentTransactionHistory_.byInvoice[num] = {
                        transactions: [],
                        totalPaid: 0,
                        invoice: invoices[i]
                    };
                }
            }

            // we will now read blockchain transactions for our vendor
            // account, trying to identify relevant transactions.

            self.blockchain_.getSDK().com.requests.account.transactions
                .incoming(self.blockchain_.getEndpoint(), self.blockchain_.getVendorWallet(), null, lastTrxRead)
                .then(function(res) {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.transactions.incoming: " + JSON.stringify(res));

                    var transactions = res.data;

                    lastTrxRead = self.saveIncomingPaymentsHistory(transactions);

                    if (lastTrxRead !== false && 25 == transactions.length) {
                        // recursion..
                        // there may be more transactions in the past (25 transactions
                        // is the limit that the API returns). If we specify a hash or ID it
                        // will look for transactions BEFORE this hash or ID (25 before ID..).
                        // We pass transactions IDs because all NEM nodes support those, hashes are
                        // only supported by a subset of the NEM nodes.
                        self.fetchInvoicesRealHistory(invoices, lastTrxRead, callback);
                    }

                    if (callback && (lastTrxRead === false || transactions.length < 25)) {
                        // done.
                        //DEBUG self.logger_.info("[NEM] [PAY-FALLBACK] ", __line, "read a total of " + Object.getOwnPropertyNames(paymentTransactionHistory_.byHash).length + " transactions from " + self.blockchain_.getVendorWallet() + ".");
                        return callback(paymentTransactionHistory_.byInvoice);
                    }
                })
                .catch(function(err) { 
                    self.logger_.error("[NEM] [PAY-HISTORY] ", __line, "An error happened: " + JSON.stringify(err));
                }); 
        };

        this.saveIncomingPaymentsHistory = function(transactions) {
            var self = this;
            var lastTrxRead = null;
            var lastMsgRead = null;
            var lastTrxHash = null;
            var lastAmtRead = null;
            var cntRelevant = 0;
            for (var i = 0; i < transactions.length; i++) {
                var content = transactions[i].transaction;
                var meta = transactions[i].meta;
                var recipient = null;

                // save transaction id
                lastTrxRead = self.blockchain_.getTransactionId(transactions[i]);
                lastTrxHash = self.blockchain_.getTransactionHash(transactions[i]);
                lastMsgRead = self.blockchain_.getTransactionMessage(transactions[i]);
                lastAmtRead = self.blockchain_.getTransactionAmount(transactions[i], "nem:xem", 6);

                if (paymentTransactionHistory_.byHash.hasOwnProperty(lastTrxHash))
                // stopping the loop, reading data we already know about.
                    return false;

                paymentTransactionHistory_.byHash[lastTrxHash] = true;

                if (content.type != self.blockchain_.getSDK().model.transactionTypes.transfer &&
                    content.type != self.blockchain_.getSDK().model.transactionTypes.multisigTransaction)
                // we are interested only in transfer transactions
                // and multisig transactions.
                    continue;

                if (!paymentTransactionHistory_.byInvoice.hasOwnProperty(lastMsgRead.toUpperCase()))
                // message does not contain any of the relevant data (for this request)
                    continue;

                var normNumber = lastMsgRead.toUpperCase();

                paymentTransactionHistory_.byInvoice[normNumber]
                    .transactions
                    .push(transactions[i]);

                paymentTransactionHistory_.byInvoice[normNumber]
                    .totalPaid += lastAmtRead;

                cntRelevant++;
            }

            var newByInvoice = paymentTransactionHistory_.byInvoice;
            for (var num in paymentTransactionHistory_.byInvoice) {
                var currentEntry = paymentTransactionHistory_.byInvoice[num];
                var currentInvoice = currentEntry.invoice;

                //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Invoice " + currentInvoice.number + " found totalPaid of " + currentEntry.totalPaid + " in " + currentEntry.transactions.length + " transactions.");

                // modify with latest data read from blockchain
                currentInvoice.amountPaid = currentEntry.totalPaid;
                if (currentInvoice.amountPaid >= currentInvoice.amount) {
                    currentInvoice.isPaid = true;
                    currentInvoice.status = 'paid';

                    if (currentInvoice.amountPaid > currentInvoice.amount)
                        currentInvoice.status = 'overpaid';
                }

                currentInvoice.dirty = true;

                // store dirty state
                newByInvoice[num].invoice = currentInvoice;
            }

            //self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found " + cntRelevant + " relevant transaction in chunk of " + transactions.length + " transactions.");

            paymentTransactionHistory_.byInvoice = newByInvoice;
            return lastTrxRead;
        };

    };

    module.exports.PaymentsCore = PaymentsCore;
}());