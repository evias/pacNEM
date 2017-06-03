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
 * @link       https://github.com/dubzzz/js-pacman
 */

/**
 * Mimics jQuery's extend function
 *
 * @see https://github.com/QuantumMechanics/NEM-sdk
 * http://stackoverflow.com/a/11197343
 */
var extendObj = function(){
    for(var i=1; i<arguments.length; i++) {
        for(var key in arguments[i]) {
            if(arguments[i].hasOwnProperty(key)) {
                arguments[0][key] = arguments[i][key];
            }
        }
    }
    return arguments[0];
};
