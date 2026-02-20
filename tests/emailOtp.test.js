const nodemailer = require('nodemailer');
const { createAccount, sendOtp } = require('../yourAccountModule'); // Adjust the path as necessary

jest.mock('nodemailer');

describe('Email OTP Verification', () => {
    let transporter;

    beforeAll(() => {
        transporter = nodemailer.createTransport.mockReturnValue({
            sendMail: jest.fn().mockImplementation((mailOptions, callback) => {
                callback(null, true);
            }),
        });
    });

    test('should generate and send OTP email upon account creation', async () => {
        const email = 'student@example.com';
        const accountData = { email };

        await createAccount(accountData); // Ensure this function triggers sendOtp

        expect(transporter.sendMail).toHaveBeenCalled();
        expect(transporter.sendMail.mock.calls[0][0].to).toBe(email);
        expect(transporter.sendMail.mock.calls[0][0].subject).toBe('Your OTP Code');
    });

    test('should handle errors when sending email', async () => {
        transporter.sendMail.mockImplementationOnce((mailOptions, callback) => {
            callback(new Error('Email sending failed'), null);
        });

        await expect(sendOtp('student@example.com')).rejects.toThrow('Email sending failed');
    });
});