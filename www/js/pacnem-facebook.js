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
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */

/**
 * Class FacebookGame
 *
 * Handling Facebook Canvas Game specializations.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var PacNEMFacebookUI = function(ui) {

    this.ui_ = ui;

    this.init = function() {
        var self = this;
        self.plugFacebookLogin(function(fbMeData) {

            var name = fbMeData.first_name + " " + fbMeData.last_name;
            __pn_evs_GameUI.getDOMWrapper()("#username").val(name);
        });
    };

    this.directCanvas = function() {
        facebookFlowImpl_();
    }

    var facebookFlowImpl_ = function() {
        // set sponsored UI with "autoSwitch" enabled
        __pn_evs_GameUI.setSponsoredUI(true, function(ui, sponsor) {
            // now display the advertisement
            ui.displaySponsorAdvertisement(sponsor, function(ui) {
                // then, emit the session creation
                __pn_evs_GameUI.getBackendSocket().emit('change_username', JSON.stringify(details));
                __pn_evs_GameUI.getBackendSocket().emit("notify");

                // and finally, create a room automatically for Facebook Players
                // after this, the countdown for the Game should start.
                var player = __pn_evs_GameUI.getPlayerDetails();

                // first create room for the Facebook Player
                //XXX would be good to Group people on Facebook to 4 Player Games.
                __pn_evs_GameUI.getBackendSocket().emit("create_room", JSON.stringify(player));

                // second start the game (in 10 seconds..)
                __pn_evs_GameUI.getBackendSocket().emit("run_game");
            });
        });
    };

    this.plugFacebookLogin = function(onSuccess) {

        var onLogin = function(response) {
            if (response.status != 'connected')
                return false;

            FB.api('/me?fields=first_name', function(data) {

                console.log("[DEBUG] " + "Facebook /me Response: " + JSON.stringify(data));

                var welcomeBlock = document.getElementById('fb-welcome');
                welcomeBlock.innerHTML = 'Welcome to PacNEM, ' + data.first_name + '!';

                onSuccess(data);
            });
        };

        FB.getLoginStatus(function(response) {
            // Check login status on load, and if the user is
            // already logged in, go directly to the welcome message.
            if (response.status == 'connected') {
                onLogin(response);
            } else {
                // Otherwise, show Login dialog first.
                FB.login(function(response) {
                    onLogin(response);
                }, { scope: 'user_friends, email' });
            }
        });
    };

    var self = this; {
        // new PacNEMFacebook UI should *NOT* initialize automatically
        // because we need to wait for the Facebook SDK to be loaded.
    }
};