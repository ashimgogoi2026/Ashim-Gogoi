import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  try {
    const influencers = await getDocs(collection(db, 'influencers'));
    console.log('Influencers count:', influencers.size);
    if (influencers.size > 0) {
      console.log('Sample doc ID:', influencers.docs[0].id);
      console.log('Sample doc Owner:', influencers.docs[0].data().ownerId);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
main();
