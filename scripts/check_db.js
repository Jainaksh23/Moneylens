/**
 * Database Connectivity Diagnostic Script.
 * Safe utility to verify MongoDB Atlas / local database connection.
 * NEVER prints the MONGODB_URI or any credentials to console, logs, or stdout/stderr.
 */

const path = require('path');

// Resolve dotenv dependency (support running from root or backend directory)
let dotenv;
try {
  dotenv = require('dotenv');
} catch {
  try {
    dotenv = require(path.resolve(__dirname, '../backend/node_modules/dotenv'));
  } catch {
    console.error('❌ Error: Could not resolve "dotenv" package. Run "npm --prefix backend install" first.');
    process.exit(1);
  }
}

// 1. Load backend/.env first (if present), then monorepo root .env, then current working directory
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// 2. Validate presence of MONGODB_URI without logging its content
const uri = process.env.MONGODB_URI;

if (!uri || typeof uri !== 'string' || uri.trim() === '') {
  console.error('❌ Error: MONGODB_URI is not set.');
  console.error('Hint: Add MONGODB_URI to backend/.env or root .env:');
  console.error('MONGODB_URI=mongodb+srv://<db_username>:<db_password>@<cluster-host>/moneylens?retryWrites=true&w=majority');
  process.exit(1);
}

// 3. Validate URI scheme without leaking the value
if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
  console.error('❌ Error: Invalid MONGODB_URI scheme.');
  console.error('Hint: The connection string must begin with "mongodb://" or "mongodb+srv://".');
  process.exit(1);
}

// 4. Resolve Mongoose dependency (support running from root or backend directory)
let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  try {
    mongoose = require(path.resolve(__dirname, '../backend/node_modules/mongoose'));
  } catch (err) {
    console.error('❌ Error: Could not resolve "mongoose" package. Run "npm --prefix backend install" first.');
    process.exit(1);
  }
}

/**
 * Sanitize error message and provide actionable guidance.
 * Guaranteed never to leak URI or credentials.
 */
function sanitizeMongoError(err) {
  if (!err) return 'Unknown database error occurred.';
  const raw = err.message || String(err);
  const code = err.code;

  if (raw.includes('Authentication failed') || raw.includes('bad auth') || code === 8000) {
    return [
      '❌ MongoDB Authentication Failed',
      'Likely cause: Wrong database username or password.',
      'Hints:',
      '  1. Verify the database user exists in MongoDB Atlas -> Database Access.',
      '  2. Verify the password is typed correctly in backend/.env.',
      '  3. If your password contains special characters (e.g. @, :, /, #, ?), they MUST be URL-encoded (e.g. %40, %3A, %2F, %23).'
    ].join('\n');
  }

  if (
    raw.includes('Server selection timed out') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('buffering timed out') ||
    raw.includes('ECONNREFUSED')
  ) {
    return [
      '❌ MongoDB Connection Timed Out',
      'Likely cause: IP address not allowed in Atlas Network Access, or cluster is unreachable.',
      'Hints:',
      '  1. Go to MongoDB Atlas -> Network Access -> IP Access List.',
      '  2. Click "Add IP Address" and select "Add Current IP Address" (or allow 0.0.0.0/0 for development).',
      '  3. Ensure cluster is running and not paused.',
      '  4. Check that outbound port 27017 is not blocked by your local firewall or VPN.'
    ].join('\n');
  }

  if (raw.includes('not authorized') || raw.includes('requires authentication') || code === 13) {
    return [
      '❌ MongoDB Authorization Failed',
      'Likely cause: User lacks readWrite permissions on database.',
      'Hints:',
      '  1. Go to MongoDB Atlas -> Database Access -> Edit User.',
      '  2. Ensure the user has the "readWrite" role on the "moneylens" database (or "readWriteAnyDatabase").'
    ].join('\n');
  }

  if (raw.includes('queryTxt ETIMEOUT') || raw.includes('querySrv ETIMEOUT') || raw.includes('ENOTFOUND')) {
    return [
      '❌ MongoDB DNS/SRV Resolution Failed',
      'Likely cause: Invalid cluster hostname or DNS failure.',
      'Hints:',
      '  1. Verify the cluster host part in MONGODB_URI matches your Atlas cluster address.',
      '  2. Test if your network/DNS can resolve SRV records.'
    ].join('\n');
  }

  // Generic fallback with strict redaction
  const redacted = raw
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***:***@')
    .replace(/mongodb(\+srv)?:\/\/[^\s"'`]+/gi, 'mongodb$1://[REDACTED]');

  return `❌ Database Error: ${redacted}`;
}

async function checkDatabase() {
  try {
    // Connect with a 10s server selection timeout
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    // Run ping command against the connected database
    const db = mongoose.connection.db;
    await db.command({ ping: 1 });

    const dbName = mongoose.connection.name || 'moneylens';

    // Print OK as required
    console.log('OK');
    console.log(`Database "${dbName}" is reachable and responding to ping.`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(sanitizeMongoError(err));
    try {
      await mongoose.disconnect();
    } catch {
      // Ignore cleanup error
    }
    process.exit(1);
  }
}

checkDatabase();
