#!/bin/bash
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "Attempt $((RETRY_COUNT+1)) to deploy firestore rules..."
  firebase deploy --only firestore:rules --project influencer-manager-d09b5
  if [ $? -eq 0 ]; then
    echo "Deployment successful!"
    exit 0
  else
    echo "Deployment failed. Retrying in 5 seconds..."
    sleep 5
    ((RETRY_COUNT++))
  fi
done

echo "Deployment failed after $MAX_RETRIES attempts."
exit 1
