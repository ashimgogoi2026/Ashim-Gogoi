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
    const campaigns = await getDocs(collection(db, 'campaigns'));
    console.log('Campaigns count:', campaigns.size);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
main();
