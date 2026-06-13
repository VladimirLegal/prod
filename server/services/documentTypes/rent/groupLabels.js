const GROUP_FORMS = {
  landlord: {
    sg: {
      nom: 'Наймодатель',
      gen: 'Наймодателя',
      dat: 'Наймодателю',
      acc: 'Наймодателя',
      ins: 'Наймодателем',
      pre: 'Наймодателе',
    },
    pl: {
      nom: 'Наймодатели',
      gen: 'Наймодателей',
      dat: 'Наймодателям',
      acc: 'Наймодателей',
      ins: 'Наймодателями',
      pre: 'Наймодателях',
    },
  },
  tenant: {
    sg: {
      nom: 'Наниматель',
      gen: 'Нанимателя',
      dat: 'Нанимателю',
      acc: 'Нанимателя',
      ins: 'Нанимателем',
      pre: 'Нанимателе',
    },
    pl: {
      nom: 'Наниматели',
      gen: 'Нанимателей',
      dat: 'Нанимателям',
      acc: 'Нанимателей',
      ins: 'Нанимателями',
      pre: 'Нанимателях',
    },
  },
};

function buildGroupLabels(nounKey, isOne) {
  const forms = GROUP_FORMS[nounKey][isOne ? 'sg' : 'pl'];

  return {
    nominative: forms.nom,
    genitive: forms.gen,
    dative: forms.dat,
    accusative: forms.acc,
    instrumental: forms.ins,
    prepositional: forms.pre,
  };
}

module.exports = {
  GROUP_FORMS,
  buildGroupLabels,
};