import os
import cv2
from pathlib import Path
from typing import Optional, Dict, List, Tuple

def detect_speaker_face_crop(video_path: Path, start_time: float, end_time: float, sample_interval: float = 1.0) -> Dict[str, int]:
    """
    Samples frames across the clip cut to detect speaker face bounding box
    and compute an optimal, time-smoothed 1:1 square crop rectangle.
    Falls back to center crop if no face detected.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {}
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    
    # Load OpenCV pre-trained Haar Cascade for face detection
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    
    face_centers_x = []
    
    current_time = start_time
    while current_time < end_time:
        frame_idx = int(current_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
        
        if len(faces) > 0:
            # Pick the largest face (main speaker)
            largest = max(faces, key=lambda f: f[2] * f[3])
            fx, fy, fw, fh = largest
            center_x = fx + fw / 2.0
            face_centers_x.append(center_x)
            
        current_time += sample_interval
        
    cap.release()
    
    square_size = min(width, height)
    if face_centers_x:
        # Smooth / median of speaker center X
        face_centers_x.sort()
        median_x = face_centers_x[len(face_centers_x) // 2]
        crop_x = int(median_x - (square_size / 2.0))
        crop_x = max(0, min(crop_x, width - square_size))
    else:
        # Fall back to centered crop
        crop_x = int((width - square_size) / 2.0)
        
    crop_y = int((height - square_size) / 2.0)
    
    return {
        "x": crop_x,
        "y": crop_y,
        "w": square_size,
        "h": square_size
    }
