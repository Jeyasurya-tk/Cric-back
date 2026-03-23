export function generateCommentary(ball: {
  batsmanName: string;
  bowlerName: string;
  runs: number;
  shotDirection?: string;
  boundaryType?: string;
  extra?: string;
  wicket?: string;
  wicketType?: string;
}): { en: string; ta: string } {
  const { batsmanName, bowlerName, runs, shotDirection, boundaryType, extra, wicket, wicketType } = ball;
  let en = "";
  let ta = "";

  if (wicket) {
    if (wicketType === 'bowled') {
      en = `BOWLED! ${bowlerName} shatters the stumps. ${batsmanName} is gone.`;
      ta = `போல்ட்! ${bowlerName} ஸ்டம்புகளை தகர்த்தார். ${batsmanName} ஆட்டமிழந்தார்.`;
    } else if (wicketType === 'caught') {
      en = `OUT! ${batsmanName} hits it towards ${shotDirection || 'the fielder'} but it's caught.`;
      ta = `அவுட்! ${batsmanName} பந்தை ${shotDirection || 'ஃபீல்டர்'} நோக்கி அடித்தார், ஆனால் அது கேட்ச் பிடிக்கப்பட்டது.`;
    } else if (wicketType === 'lbw') {
      en = `Appeal... given! ${batsmanName} trapped LBW by ${bowlerName}.`;
      ta = `முறையீடு... அவுட்! ${bowlerName} வீசிய பந்தில் ${batsmanName} எல்.பி.டபிள்யூ ஆனார்.`;
    } else if (wicketType === 'run out') {
      en = `RUN OUT! Direct hit and ${batsmanName} is short of the crease.`;
      ta = `ரன் அவுட்! நேரடி அடி, ${batsmanName} கிரீஸிற்குள் வரவில்லை.`;
    } else {
      en = `OUT! ${batsmanName} is dismissed (${wicketType}).`;
      ta = `அவுட்! ${batsmanName} ஆட்டமிழந்தார் (${wicketType}).`;
    }
  } else if (extra) {
    if (extra === 'wide') {
      en = `Wide ball from ${bowlerName}.`;
      ta = `${bowlerName} வீசிய வைட் பால்.`;
    } else if (extra === 'noball') {
      en = `No ball from ${bowlerName}. Free hit coming up.`;
      ta = `${bowlerName} வீசிய நோ பால். அடுத்து ஃப்ரீ ஹிட்.`;
    } else if (extra === 'bye') {
      en = `The ball goes past the batsman. They take a bye.`;
      ta = `பந்து பேட்ஸ்மேனை கடந்து சென்றது. அவர்கள் ஒரு பை ரன் எடுத்தனர்.`;
    } else if (extra === 'legbye') {
      en = `Deflects off the pads and they collect a leg bye.`;
      ta = `பேடில் பட்டு சென்ற பந்தில் லெக் பை ரன் எடுத்தனர்.`;
    }
  } else if (runs === 0) {
    en = `No run. Good delivery by ${bowlerName}, defended by ${batsmanName}.`;
    ta = `ரன் இல்லை. ${bowlerName} வீசிய நல்ல பந்து, ${batsmanName} தடுத்தார்.`;
  } else if (runs === 4) {
    en = `FOUR! ${batsmanName} plays a brilliant shot through ${shotDirection || 'the gap'}.`;
    ta = `ஃபோர்! ${batsmanName} ${shotDirection || 'இடைவெளி'} வழியாக ஒரு சிறந்த ஷாட் விளையாடினார்.`;
  } else if (runs === 6) {
    en = `SIX! ${batsmanName} launches it over ${shotDirection || 'the boundary'} for a massive six.`;
    ta = `சிக்ஸர்! ${batsmanName} பந்தை ${shotDirection || 'எல்லை'}க்கு மேல் ஒரு பிரம்மாண்டமான சிக்ஸருக்கு அடித்தார்.`;
  } else if (runs === 1) {
    en = `${batsmanName} pushes it towards ${shotDirection || 'the fielder'} and takes a quick single.`;
    ta = `${batsmanName} பந்தை ${shotDirection || 'ஃபீல்டர்'} நோக்கி தட்டிவிட்டு ஒரு ரன் எடுத்தார்.`;
  } else if (runs === 2) {
    en = `${batsmanName} drives it towards ${shotDirection || 'the deep'}. They come back for two.`;
    ta = `${batsmanName} பந்தை ${shotDirection || 'டீப்'} நோக்கி அடித்தார். அவர்கள் இரண்டு ரன்கள் எடுத்தனர்.`;
  } else if (runs === 3) {
    en = `Beautiful placement by ${batsmanName} into the ${shotDirection || 'field'}. They run three.`;
    ta = `${batsmanName} பந்தை ${shotDirection || 'ஃபீல்டு'} நோக்கி தட்டிவிட்டு மூன்று ரன்கள் எடுத்தனர்.`;
  } else {
    en = `${batsmanName} scores ${runs} run(s) towards ${shotDirection || 'the field'}.`;
    ta = `${batsmanName} ${shotDirection || 'ஃபீல்டு'} நோக்கி ${runs} ரன்(கள்) எடுத்தார்.`;
  }

  return { en, ta };
}
