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

    this.init = function(facebookCanvasUI__) {
        var self = this;
        self.plugFacebookLogin(function(fbMeData) {

            var name = fbMeData.first_name + " " + fbMeData.last_name;
            facebookCanvasUI__.getDOM("#username").val(name);
        });
    };

    this.directCanvas = function(facebookCanvasUI__) {
        facebookFlowImpl_(facebookCanvasUI__);
    }

    var facebookFlowImpl_ = function(facebookCanvasUI__) {

        var ctrl = facebookCanvasUI__.getController()
            .setPlayMode("sponsored")
            .setAdvertised(true);

        // set sponsored UI with "autoSwitch" enabled
        facebookCanvasUI__.setSponsoredUI(true, function(ui, sponsor) {

            ctrl.sponsorizeName(ctrl.getSponsor());
            ctrl.setAdvertised(true);

            // now display the advertisement
            ui.displaySponsorAdvertisement(sponsor, function(ui) {
                // then, emit the session creation
                facebookCanvasUI__.getBackendSocket().emit('change_username', JSON.stringify(details));
                facebookCanvasUI__.getBackendSocket().emit("notify");

                // and finally, create a room automatically for Facebook Players
                // after this, the countdown for the Game should start.
                var player = facebookCanvasUI__.getPlayerDetails();

                // first create room for the Facebook Player
                //XXX would be good to Group people on Facebook to 4 Player Games.
                facebookCanvasUI__.getBackendSocket().emit("create_room", JSON.stringify(player));

                // second start the game (in 10 seconds..)
                facebookCanvasUI__.getBackendSocket().emit("run_game");
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