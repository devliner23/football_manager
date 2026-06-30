function evaluateTrade(proposingPlayers, receivingPlayers) {
  const VALUE_WEIGHTS = {
    overall: 1.0,
    potential: 0.8,
    ageBonus: (age) => (age < 25 ? 5 : age > 30 ? -5 : 0)
  };

  const calculatePlayerValue = (player) => {
    const ovr = player.overall_rating || 50;
    const pot = player.potential_rating || 50;
    const age = player.age || 25;
    return ovr * VALUE_WEIGHTS.overall +
           pot * VALUE_WEIGHTS.potential +
           VALUE_WEIGHTS.ageBonus(age);
  };

  const incomingValue = proposingPlayers.reduce((sum, p) => sum + calculatePlayerValue(p), 0);
  const outgoingValue = receivingPlayers.reduce((sum, p) => sum + calculatePlayerValue(p), 0);

  // AI accepts if it's getting equal or better value (10% tolerance)
  const threshold = outgoingValue * 0.9;
  if (incomingValue >= threshold) {
    return { accepted: true, reason: 'Trade is fair or favorable.' };
  } else {
    return {
      accepted: false,
      reason: `Not enough value in return (incoming: ${incomingValue.toFixed(1)} vs outgoing: ${outgoingValue.toFixed(1)})`
    };
  }
}