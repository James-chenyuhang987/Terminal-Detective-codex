import React from 'react';
import HolographicLobby from '@/components/game/HolographicLobby.jsx';

export default function AgentLobby({ onDeploy, onBack }) {
  return <HolographicLobby onDeploy={onDeploy} onBack={onBack} />;
}