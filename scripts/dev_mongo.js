/**
 * Local Development MongoDB Runner using mongodb-memory-server.
 * Runs standalone on 127.0.0.1:27017 for local development when native mongod is not installed.
 */
const { MongoMemoryServer } = require('../backend/node_modules/mongodb-memory-server');

async function startLocalMongo() {
  console.log('⏳ Starting local MongoDB instance on port 27017...');
  try {
    const mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        ip: '127.0.0.1',
        dbName: 'moneylens_dev',
      },
    });

    const uri = mongod.getUri();
    console.log(`✅ Local MongoDB is running at: ${uri}`);
    console.log('📌 Database: moneylens_dev');

    const handleShutdown = async () => {
      console.log('\n🛑 Stopping MongoDB instance...');
      await mongod.stop();
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  } catch (err) {
    if (err.message && err.message.includes('EADDRINUSE')) {
      console.log('ℹ️ Port 27017 is already in use (MongoDB already running). Continuing...');
    } else {
      console.error('❌ Failed to start MongoDB:', err.message);
      process.exit(1);
    }
  }
}

startLocalMongo();
