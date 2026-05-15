/**
 * Barrel export — todos os dados do agente Junior
 */
export { AUDIO_SCRIPTS, getAudioScripts, getRandomAudioScript } from "./juniorScripts";
export type { AudioScript } from "./juniorScripts";

export { FLUXOS_CENARIOS, getFluxoByCenario } from "./juniorFluxos";
export type { FluxoCenario, FluxoMensagem } from "./juniorFluxos";

export {
  FOLLOWUP_CADENCIA,
  OBJECOES_RESPOSTAS,
  findObjecaoResposta,
  getFollowUpByDia,
} from "./juniorFollowupObjecoes";
export type { FollowUpToque, ObjecaoResposta } from "./juniorFollowupObjecoes";
