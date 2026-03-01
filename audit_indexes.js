import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('--- Database Index Audit ---');

    const db = mongoose.connection.db;
    const collections = ['chatmessages', 'chatconversations'];

    for (const collName of collections) {
        console.log(`\nCollection: ${collName}`);
        const indexes = await db.collection(collName).indexes();
        
        indexes.forEach(idx => {
            const keys = Object.keys(idx.key).join(', ');
            const unique = idx.unique ? '[UNIQUE] ' : '';
            console.log(`- ${unique}${idx.name}: (${keys})`);
        });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
