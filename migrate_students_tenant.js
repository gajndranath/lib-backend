import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DEFAULT_TENANT_ID = '6995732a16bbef6330824e3c';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

const migrate = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const Student = mongoose.model('Student', new mongoose.Schema({}, { strict: false }));
    
    const result = await Student.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: new mongoose.Types.ObjectId(DEFAULT_TENANT_ID) } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} students.`);
    
    // Also update any without a tenantId (null or empty)
    const result2 = await Student.updateMany(
      { tenantId: null },
      { $set: { tenantId: new mongoose.Types.ObjectId(DEFAULT_TENANT_ID) } }
    );
    console.log(`Fallback update complete. Updated ${result2.modifiedCount} more students.`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
