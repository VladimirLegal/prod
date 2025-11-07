// client/src/utils/pdfGenerator.js
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

export const generatePdf = (content, fileName = 'document') => {
  const documentDefinition = {
    content: [
      { text: 'Договор аренды квартиры', style: 'header' },
      { text: content }
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      }
    },
    defaultStyle: {
      fontSize: 12,
      lineHeight: 1.5
    }
  };
  
  pdfMake.createPdf(documentDefinition).download(`${fileName}.pdf`);
};