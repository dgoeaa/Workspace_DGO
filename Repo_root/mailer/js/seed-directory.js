// The addressee directory as delivered in the "Nigerian Government Letter Mailing Guide"
// (verified institutional email addresses, official websites and sending notes).
//
// Kept verbatim: the addressee lines, addresses and verification notes are the guide's own.
// Two things the guide says are carried as data rather than lost:
//
//  - NPC has no address. The guide leaves it out deliberately because no sufficiently reliable
//    official address was established. It is seeded inactive with an empty email, and the
//    mailer will not select it until someone enters a verified address.
//  - Two addresses are verified but purpose-specific (ONSA's strategic communications inbox,
//    and the NPF press desk standing in for the DIG ICT). They are flagged `caution` so the
//    operator sees the note at the moment of choosing them.
//
// `key` is the stable identifier: it names per-recipient attachments ("NUC_letter.pdf"),
// forms part of each messageId, and is the Title of the row in SharePoint.

export const DIRECTORY_SOURCE = 'Nigerian Government Letter Mailing Guide';

const row = (sortOrder, key, institution, addressee, email, website, verification, category, extra = {}) => ({
  key, institution, addressee, email, cc: [], website, verification, category,
  salutation: 'Sir/Madam', active: Boolean(email), notes: '', caution: false, sortOrder, ...extra,
});

export const SEED_DIRECTORY = Object.freeze([
  row(1, 'NPF-NCCC', 'Nigeria Police Force – National Cybercrime Centre (NPF-NCCC)', 'The Director, NPF-NCCC',
    '247poc.npfnccc@npf.gov.ng', 'https://npf.gov.ng', 'Verified / official-source record', 'Security'),
  row(2, 'NPHCDA', 'National Primary Health Care Development Agency (NPHCDA)', 'The Executive Director/CEO, NPHCDA',
    'info@nphcda.gov.ng', 'https://nphcda.gov.ng/contact-us/', 'Verified / official website', 'Health'),
  row(3, 'ONSA', 'Office of the National Security Adviser (ONSA)', 'The National Security Adviser',
    'stratcom@nsa.gov.ng', 'https://nsa.gov.ng/', 'Verified, but purpose-specific', 'Security',
    { caution: true, notes: 'Strategic communications inbox — verified, but purpose-specific.' }),
  row(4, 'NDPC', 'Nigeria Data Protection Commission (NDPC)', 'The National Commissioner/CEO, NDPC',
    'info@ndpc.gov.ng', 'https://www.ndpc.gov.ng/', 'Verified / official website', 'Regulatory'),
  row(5, 'OAGF', 'Office of the Accountant-General of the Federation (OAGF)', 'The Accountant-General of the Federation',
    'info@oagf.gov.ng', 'https://oagf.gov.ng/', 'Verified / official website', 'Finance'),
  row(6, 'NUC', 'National Universities Commission (NUC)', 'The Executive Secretary, NUC',
    'info@nuc.edu.ng', 'https://www.nuc.edu.ng/contact-us/', 'Verified / official website', 'Education'),
  row(7, 'NPF-ICT', 'Nigeria Police Force, Department of ICT, FHQ', 'The Deputy Inspector-General of Police, Department of ICT',
    'pressforabuja@npf.gov.ng', 'https://npf.gov.ng/home/department/4', 'Verified / official NPF page; not a named DIG inbox', 'Security',
    { caution: true, notes: 'NPF press desk address on the official NPF page — not a named DIG inbox.' }),
  row(8, 'ICPC', 'Independent Corrupt Practices and Other Related Offences Commission (ICPC)', 'The Chairman',
    'info@icpc.gov.ng', 'https://icpc.gov.ng/', 'Verified / official website', 'Anti-corruption'),
  row(9, 'JAMB', 'Joint Admissions and Matriculation Board (JAMB)', 'The Registrar',
    'info@jamb.gov.ng', 'https://www.jamb.gov.ng/ContactUs', 'Verified / official website', 'Education'),
  row(10, 'TETFUND', 'Tertiary Education Trust Fund (TETFund)', 'The Executive Secretary, TETFund',
    'info@tetfund.gov.ng', 'https://www.tetfund.gov.ng/', 'Verified / official website', 'Education'),
  row(11, 'SON', 'Standards Organisation of Nigeria (SON)', 'The Director-General/CEO, SON',
    'info@son.gov.ng', 'https://son.gov.ng/contact-us/', 'Verified / official website', 'Regulatory'),
  row(12, 'FME', 'Federal Ministry of Education', 'The Honourable Minister',
    'info@education.gov.ng', 'https://education.gov.ng/contact-us/', 'Verified / official website', 'Ministry'),
  row(13, 'NPC', 'National Population Commission (NPC)', 'The Chairman, National Population Commission',
    '', 'https://nationalpopulation.gov.ng/', 'Not yet sufficiently verified', 'Identity & Statistics',
    { active: false, caution: true, notes: 'NOT YET VERIFIED — the guide deliberately gives no address. Enter one only once it is verified.' }),
  row(14, 'NIMC', 'National Identity Management Commission (NIMC)', 'The Director-General',
    'nimccustomercare@nimc.gov.ng', 'https://nimc.gov.ng/contact-us', 'Verified / official website', 'Identity & Statistics'),
  row(15, 'NCS', 'Nigeria Customs Service (NCS)', 'The Comptroller-General, Nigeria Customs Service',
    'info@customs.gov.ng', 'https://customs.gov.ng/', 'Verified / official website', 'Revenue & Border'),
  row(16, 'NIS', 'Nigeria Immigration Service (NIS)', 'The Comptroller-General, Nigeria Immigration Service',
    'nis.servicom@nigeriaimmigration.gov.ng', 'https://immigration.gov.ng/info-center/', 'Verified / official website', 'Revenue & Border'),
  row(17, 'NRS', 'Nigeria Revenue Service (NRS)', 'The Executive Chairman',
    'contactus@nrs.gov.ng', 'https://www.nrs.gov.ng/', 'Verified / official website', 'Revenue & Border'),
  row(18, 'NIGCOMSAT', 'NIGCOMSAT / Nigerian Communications Satellite Ltd.', 'The Managing Director/CEO, NIGCOMSAT',
    'info@nigcomsat.gov.ng', 'https://nigcomsat.gov.ng/contacts', 'Verified / official website', 'Technology'),
  row(19, 'NBS', 'National Bureau of Statistics (NBS)', 'The Statistician-General of the Federation/CEO',
    'feedback@nigerianstat.gov.ng', 'https://nigerianstat.gov.ng/contact', 'Verified / official website', 'Identity & Statistics'),
  row(20, 'NAFDAC', 'National Agency for Food and Drug Administration and Control (NAFDAC)', 'The Director-General/CEO, NAFDAC',
    'nafdac@nafdac.gov.ng', 'https://www.nafdac.gov.ng/', 'Verified / official NAFDAC material', 'Health'),
  row(21, 'FMIST', 'Federal Ministry of Innovation, Science and Technology (FMIST)', 'The Honourable Minister',
    'info@scienceandtech.gov.ng', 'https://fmist.gov.ng/', 'Verified / official ministry web presence', 'Ministry'),
  row(22, 'NIPOST', 'Nigerian Postal Service (NIPOST)', 'The Postmaster-General/CEO, NIPOST',
    'info@nipost.gov.ng', 'https://nipost.gov.ng/contact/', 'Verified / official website', 'Technology'),
  row(23, 'CBN', 'Central Bank of Nigeria (CBN)', 'The Governor',
    'contactcbn@cbn.gov.ng', 'https://www.cbn.gov.ng/', 'Verified / official CBN service material', 'Finance'),
  row(24, 'BPP', 'Bureau of Public Procurement (BPP)', 'The Director-General',
    'info@bpp.gov.ng', 'https://bpp.gov.ng/', 'Verified / official website', 'Finance'),
  row(25, 'BPSR', 'Bureau of Public Service Reforms (BPSR)', 'The Director-General',
    'info@bpsr.gov.ng', 'https://bpsr.gov.ng/', 'Verified / official website', 'Public Service'),
].map(Object.freeze));
