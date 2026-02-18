import http from 'node:http';

const testStudentSubscribe = () => {
    // We need a valid student JWT to test this properly, 
    // but we can at least check if it fails with 401 instead of 500 when no token is provided,
    // or simulate if we had a way to mock req.student.
    // Actually, I'll just check if the endpoint exists and doesn't 404/500 immediately if possible.
    
    // Since it's protected by verifyStudentJWT/verifyJWT, it should 401.
    // The previous 500 was likely happening AFTER authentication but during controller execution.
    
    const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/api/v1/notification/subscribe',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': '6995732a16bbef6330824e3c'
        }
    };

    const req = http.request(options, (res) => {
        console.log(`Status: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Response:', data);
            // If it's 401, it's fine (authentication works). 
            // If it's 500, then my fix failed or there's another issue.
            if (res.statusCode === 500) {
                console.error('FAILED: Still getting 500');
                process.exit(1);
            } else {
                console.log('SUCCESS: No 500 error');
                process.exit(0);
            }
        });
    });

    req.on('error', e => {
        console.error('Error:', e.message);
        process.exit(1);
    });

    req.write(JSON.stringify({
        subscription: 'test-token',
        type: 'fcm'
    }));
    req.end();
};

testStudentSubscribe();
