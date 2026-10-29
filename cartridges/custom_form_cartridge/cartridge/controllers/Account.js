'use strict';

/**
 * Custom Account Controller extending base Account controller
 * Adds backend validation for Date of Birth and Phone Number,
 * and persists them to Customer Profile custom attributes.
 */

var server = require('server');
server.extend(module.superModule);

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

/**
 * Checks if a given year is a leap year
 * @param {number} year - The year to check
 * @returns {boolean} - true if leap year, false otherwise
 */
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Validates whether the given string is a real calendar date in DD-MM-YYYY format
 * @param {string} dateStr - Date string in DD-MM-YYYY
 * @returns {boolean} - true if valid real calendar date
 */
function isValidCalendarDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return false;
    }

    var match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) {
        return false;
    }

    var day = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var year = parseInt(match[3], 10);

    if (month < 1 || month > 12) {
        return false;
    }

    if (year < 1900 || year > 2100) {
        return false;
    }

    var daysInMonth = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month - 1]) {
        return false;
    }

    return true;
}

/**
 * Converts a DD-MM-YYYY string to a JavaScript Date object
 * @param {string} dateStr - Date string in DD-MM-YYYY
 * @returns {Date} - Date object
 */
function parseDobToDate(dateStr) {
    var parts = dateStr.split('-');
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);
    return new Date(year, month - 1, day);
}

/**
 * Server.prepend on SubmitRegistration:
 * Performs server-side validation on Date of Birth and Phone Number.
 * Even if frontend validation is bypassed, backend will reject invalid submissions.
 */
server.prepend('SubmitRegistration', function (req, res, next) {
    var registrationForm = server.forms.getForm('profile');
    var dobValue = registrationForm.customer.dateOfBirth ? registrationForm.customer.dateOfBirth.value : null;
    var phoneValue = registrationForm.customer.phone ? registrationForm.customer.phone.value : null;

    var phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

    // Store custom fields in viewData so they are preserved across middleware
    res.setViewData({
        customDob: dobValue,
        customPhone: phoneValue
    });

    // 1. Server-side Phone Number Validation
    if (!phoneValue || phoneValue.trim() === '') {
        registrationForm.customer.phone.valid = false;
        registrationForm.customer.phone.error = Resource.msg('error.message.phone.required', 'forms', null);
        registrationForm.valid = false;
    } else if (!phoneRegex.test(phoneValue.trim())) {
        registrationForm.customer.phone.valid = false;
        registrationForm.customer.phone.error = Resource.msg('error.message.invalid.phone', 'forms', null);
        registrationForm.valid = false;
    }

    // 2. Server-side Date of Birth Validation
    if (!dobValue || dobValue.trim() === '') {
        registrationForm.customer.dateOfBirth.valid = false;
        registrationForm.customer.dateOfBirth.error = Resource.msg('error.message.dob.required', 'forms', null);
        registrationForm.valid = false;
    } else if (!isValidCalendarDate(dobValue.trim())) {
        registrationForm.customer.dateOfBirth.valid = false;
        registrationForm.customer.dateOfBirth.error = Resource.msg('error.message.invalid.dob', 'forms', null);
        registrationForm.valid = false;
    }

    next();
});

/**
 * Server.append on SubmitRegistration:
 * Saves validated Date of Birth and Phone Number to the Customer Profile custom attributes.
 */
server.append('SubmitRegistration', function (req, res, next) {
    this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
        var viewData = res.getViewData();
        if (viewData && viewData.authenticatedCustomer) {
            var profile = viewData.authenticatedCustomer.getProfile();
            var customDob = viewData.customDob;
            var customPhone = viewData.customPhone;

            try {
                Transaction.wrap(function () {
                    if (customDob && isValidCalendarDate(customDob.trim())) {
                        profile.custom.dateOfBirth = parseDobToDate(customDob.trim());
                    }
                    if (customPhone) {
                        profile.custom.phoneNumber = customPhone.trim();
                    }
                });
            } catch (e) {
                Logger.getLogger('registration', 'Account').error(
                    'Error persisting custom profile attributes dateOfBirth/phoneNumber: {0}',
                    e.message
                );
            }
        }
    });

    next();
});

module.exports = server.exports();

