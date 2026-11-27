// @ts-check
// Style support varies by voice and locale even within the same model.
const maiVoiceStyleGroups = [
  ['cs-CZ-Grant cs-CZ-Harper da-DK-Harper de-DE-Grant de-DE-Harper en-US-Grant en-US-Sage es-MX-Harper fi-FI-Harper fr-FR-Harper hu-HU-Harper id-ID-Grant ko-KR-Grant ko-KR-Harper nl-NL-Harper pl-PL-Harper sv-SE-Harper th-TH-Grant th-TH-Harper zh-CN-Grant zh-CN-Harper', 'agent audiobook customer_call_center educational narrator neutral'],
  ['da-DK-Grant hi-IN-Harper nl-NL-Grant ro-RO-Grant vi-VN-Grant', 'agent customer_call_center educational narrator neutral'],
  ['de-DE-Klaus de-DE-Mia en-AU-Isla en-US-Ethan en-US-Olivia es-MX-Alejo es-MX-Valeria fr-FR-Marc fr-FR-Soleil hi-IN-Dhruv hi-IN-Kavya hi-IN-Priya it-IT-Luca it-IT-Rosa pt-BR-Caio pt-BR-Luana zh-CN-Bo zh-CN-Mei', 'angry confused determined disgusted embarrassed excited fearful happy hopeful jealous joyful neutral regretful relieved sad shouting softvoice surprised whispering'],
  ['en-GB-Emily', 'agent angry audiobook confused customer_call_center disgusted educational embarrassed excited fearful happy jealous joyful narrator neutral sad surprised'],
  ['en-GB-Harry', 'agent angry audiobook customer_call_center disgusted educational fearful joyful narrator neutral sad surprised'],
  ['en-IN-Dhruv en-IN-Priya en-US-Iris en-US-Jasper es-MX-Grant fi-FI-Grant fr-FR-Grant hu-HU-Bence hu-HU-Grant hu-HU-Levente hu-HU-Lilla hu-HU-Reka id-ID-Harper pl-PL-Grant pt-PT-Grant pt-PT-Harper ro-RO-Andrei ro-RO-Elena ro-RO-Ioana ro-RO-Radu sv-SE-Grant', 'neutral'],
  ['en-US-Harper', 'agent angry audiobook confused customer_call_center determined educational embarrassed excited happy hopeful joyful narrator neutral regretful relieved sad shouting softvoice whispering'],
  ['es-ES-Marta nl-NL-Sander ru-RU-Lev ru-RU-Masha th-TH-Krit th-TH-Nattapong tr-TR-Aydin tr-TR-Elif', 'adventurous caringempathy curious encouraging excited friendlycheerful neutral nostalgic reflective saddisappointed serious'],
  ['hi-IN-Arjun zh-CN-Wei', 'angry confused disgusted embarrassed excited fearful happy hopeful jealous joyful neutral regretful sad surprised'],
  ['hi-IN-Grant ro-RO-Harper vi-VN-Harper', 'audiobook neutral'],
  ['it-IT-Grant', 'audiobook educational neutral'],
  ['it-IT-Harper', 'agent customer_call_center narrator neutral'],
  ['ko-KR-Haena pt-BR-Rafael pt-PT-Rui', 'angry confused determined embarrassed excited happy hopeful joyful neutral regretful relieved sad softvoice surprised'],
  ['ko-KR-Junho', 'angry confused determined embarrassed excited happy hopeful joyful neutral relieved sad softvoice'],
  ['nb-NO-Grant', 'educational neutral'],
  ['nb-NO-Harper', 'agent audiobook customer_call_center narrator neutral'],
  ['pt-BR-Grant', 'agent customer_call_center educational neutral'],
  ['pt-BR-Harper', 'audiobook narrator neutral'],
  ['pt-BR-Pedro', 'confused determined embarrassed excited happy hopeful joyful neutral regretful relieved sad softvoice surprised'],
  ['ru-RU-Grant', 'agent customer_call_center neutral'],
  ['ru-RU-Harper', 'audiobook educational narrator neutral'],
  ['tr-TR-Grant', 'educational narrator neutral'],
  ['tr-TR-Harper', 'agent audiobook customer_call_center neutral'],
  ['zh-CN-Lan', 'angry confused disgusted embarrassed excited fearful happy joyful neutral sad surprised'],
];

const styles = new Map(maiVoiceStyleGroups.flatMap(([voices, values]) =>
  voices.split(' ').map(voice => /** @type {[string, string[]]} */ ([voice, values.split(' ')]))));

/** @param {string} voice */
export function getMaiVoiceStyles(voice) {
  return styles.get(voice.replace(/:MAI-Voice-2\.1$/, '')) || [];
}
