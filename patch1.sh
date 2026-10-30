sed -i 's/setPdfBillDate(defaultBillDate);/setPdfBillDate(task.pdfBillDate !== undefined ? task.pdfBillDate : defaultBillDate);/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfVideoNo(videoId);/setPdfVideoNo(task.pdfVideoNo !== undefined ? task.pdfVideoNo : videoId);/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfVideoReleaseDate(releaseDate);/setPdfVideoReleaseDate(task.pdfVideoReleaseDate !== undefined ? task.pdfVideoReleaseDate : releaseDate);/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfCampaignBrand(brandName && productName ? `${brandName} \/ ${productName}` : (brandName || productName || '\'''\''));/setPdfCampaignBrand(task.pdfCampaignBrand !== undefined ? task.pdfCampaignBrand : (brandName \&\& productName ? `${brandName} \/ ${productName}` : (brandName || productName || '\'''\'')));/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfVideoLink(task.videoLink1 || '\'''\'');/setPdfVideoLink(task.pdfVideoLink !== undefined ? task.pdfVideoLink : (task.videoLink1 || '\'''\''));/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfItemDesc('\''Product Promotion video'\'');/setPdfItemDesc(task.pdfItemDesc !== undefined ? task.pdfItemDesc : '\''Product Promotion video'\'');/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfRate(defaultRate);/setPdfRate(task.pdfRate !== undefined ? task.pdfRate : defaultRate);/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfAdditionalItemDesc('\'''\'');/setPdfAdditionalItemDesc(task.pdfAdditionalItemDesc || '\'''\'');/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfAdditionalItemAmount('\'''\'');/setPdfAdditionalItemAmount(task.pdfAdditionalItemAmount || '\'''\'');/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfOrderNumber('\'''\'');/setPdfOrderNumber(task.pdfOrderNumber || '\'''\'');/' src/components/SecureBillPayment.tsx
sed -i 's/setPdfOrderDate('\'''\'');/setPdfOrderDate(task.pdfOrderDate || '\'''\'');/' src/components/SecureBillPayment.tsx
