export type LiveWorkClientState={cursor:number;phase:"BOOTSTRAPPING"|"LIVE"|"FALLBACK";generation:number};
export const initialLiveWorkClientState=():LiveWorkClientState=>({cursor:0,phase:"BOOTSTRAPPING",generation:0});
export function applyLiveBootstrap(state:LiveWorkClientState,cursor:number):LiveWorkClientState{return{cursor:Math.max(state.cursor,Math.max(0,cursor)),phase:"LIVE",generation:state.generation};}
export function applyLiveEvent(state:LiveWorkClientState,eventId:number){if(!Number.isSafeInteger(eventId)||eventId<=state.cursor)return{state,accepted:false};return{state:{...state,cursor:eventId,phase:"LIVE" as const},accepted:true};}
export function beginLiveReconnect(state:LiveWorkClientState):LiveWorkClientState{return{...state,phase:"FALLBACK",generation:state.generation+1};}
export function applyFallbackVersion(state:LiveWorkClientState,cursor:number){const changed=cursor>state.cursor;return{state:{...state,cursor:Math.max(state.cursor,cursor),phase:"FALLBACK" as const},changed};}
