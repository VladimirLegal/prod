import jsQR from 'jsqr';

export const extractBankDetailsFromQR = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (!code) {
          reject(new Error('QR-код не распознан.'));
        } else {
          const result = {};
          const parts = code.data.split('|');

          parts.forEach(part => {
            const [key, value] = part.split('=');
            if (key && value) {
              result[key.trim()] = value.trim();
            }
          });

          resolve({
            bankRecipient: result.Name || '',
            bankAccount: result.PersonalAcc || '',
            bankBik: result.BIC || '',
            bankCorrAccount: result.CorrespAcc || '',
            bankName: result.BankName || '',
            bankInnKpp: result.PayeeINN && result.KPP ? `${result.PayeeINN}/${result.KPP}` : ''
          });
        }
      };

      img.onerror = () => reject(new Error('Невозможно загрузить изображение.'));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsDataURL(file);
  });
};
