import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, collectionGroup } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        const querySnapshot = await getDocs(collectionGroup(db, 'tasks'));
        const tasks = [];
        querySnapshot.forEach((doc) => {
            tasks.push(doc.data());
        });
        console.log(`Found ${tasks.length} tasks`);
        fs.writeFileSync('all_tasks.json', JSON.stringify(tasks, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
