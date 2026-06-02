export const acquisitionToDistributionType = (type) => {
  switch (type) {
    case 'apartment':
      return 'whole_object';
    case 'apartment_share':
      return 'share_in_apartment';
    case 'communal_room_share':
      return 'communal_room_share';
    case 'separate_room':
      return 'separate_room';
    case 'house_with_land':
    case 'house_with_land_share':
      return 'stub_house';
    default:
      return '';
  }
};

export const buildDistributionBaseDraft = ({ object = {}, acquisitionType = '', source = '' }) => {
  const type = acquisitionToDistributionType(acquisitionType);
  const isHouseStub = type === 'stub_house';

  return {
    type,
    totalObjectArea: object.area || '',
    baseArea: object.area || '',
    purchasePriceForCalculation: object.purchasePrice || '',
    purchasedShare: object.purchasedShare || '',
    legalShare: object.legalShare || '',
    roomArea: object.roomArea || '',
    roomNumber: object.roomNumber || '',
    livingArea: object.livingArea || '',
    calculationWarning: isHouseStub
      ? 'Дом с участком и доля в доме с участком будут поддержаны после добавления второй выписки на земельный участок.'
      : '',
    source,
  };
};