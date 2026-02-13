import type { CaptureMode, CaptureState } from "./CaptureControls";
import type { CapturedLocation } from "./LocationCapture";
import type { SealResponse } from "@/hooks/useSealMutation";

export interface CameraCaptureState {
  captureState: CaptureState;
  captureMode: CaptureMode;
  errorMessage: string;
  sealData: SealResponse | null;
  capturedImageUrl: string | null;
  capturedVideoUrl: string | null;
  capturedLocation: CapturedLocation | null;
  pendingLocalId: string | null;
  pendingThumbnail: string | null;
  currentLocation: GeolocationPosition | null;
}

export type CameraCaptureAction =
  | { type: "SET_CAPTURE_STATE"; payload: CaptureState }
  | { type: "SET_CAPTURE_MODE"; payload: CaptureMode }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_LOCATION"; payload: GeolocationPosition | null }
  | { type: "CAPTURE_TAKEN"; imageUrl: string; location: CapturedLocation | null }
  | { type: "VIDEO_TAKEN"; videoUrl: string; location: CapturedLocation | null }
  | {
      type: "SEAL_SUCCESS";
      sealData: SealResponse;
      imageUrl: string | null;
      videoUrl: string | null;
      location: CapturedLocation | null;
    }
  | {
      type: "OFFLINE_SAVED";
      localId: string;
      thumbnail: string | null;
      imageUrl: string | null;
      videoUrl: string | null;
      location: CapturedLocation | null;
    }
  | { type: "RESET" };

export const initialCameraCaptureState: CameraCaptureState = {
  captureState: "idle",
  captureMode: "photo",
  errorMessage: "",
  sealData: null,
  capturedImageUrl: null,
  capturedVideoUrl: null,
  capturedLocation: null,
  pendingLocalId: null,
  pendingThumbnail: null,
  currentLocation: null,
};

export function cameraCaptureReducer(
  state: CameraCaptureState,
  action: CameraCaptureAction,
): CameraCaptureState {
  switch (action.type) {
    case "SET_CAPTURE_STATE":
      return { ...state, captureState: action.payload };
    case "SET_CAPTURE_MODE":
      return { ...state, captureMode: action.payload };
    case "SET_ERROR":
      return { ...state, errorMessage: action.payload, captureState: "error" };
    case "SET_LOCATION":
      return { ...state, currentLocation: action.payload };
    case "CAPTURE_TAKEN":
      return { ...state, capturedImageUrl: action.imageUrl, capturedLocation: action.location };
    case "VIDEO_TAKEN":
      return { ...state, capturedVideoUrl: action.videoUrl, capturedLocation: action.location };
    case "SEAL_SUCCESS":
      return {
        ...state,
        captureState: "success",
        sealData: action.sealData,
        capturedImageUrl: action.imageUrl ?? state.capturedImageUrl,
        capturedVideoUrl: action.videoUrl ?? state.capturedVideoUrl,
        capturedLocation: action.location,
      };
    case "OFFLINE_SAVED":
      return {
        ...state,
        captureState: "pending_sync",
        pendingLocalId: action.localId,
        pendingThumbnail: action.thumbnail,
        capturedImageUrl: action.imageUrl ?? state.capturedImageUrl,
        capturedVideoUrl: action.videoUrl ?? state.capturedVideoUrl,
        capturedLocation: action.location,
      };
    case "RESET":
      return { ...initialCameraCaptureState, captureMode: state.captureMode };
    default:
      return state;
  }
}
