// Define the models used in the application

export interface ExerciseSet {
  id: string;
  weight?: number;
  reps?: number;
  distance?: number;
  duration?: number;
  set_type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Exercise {
  id: string;
  exercise_template_id: string;
  name: string;
  notes?: string;
  sets: ExerciseSet[];
  created_at?: string;
  updated_at?: string;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time?: string;
  exercises: Exercise[];
  created_at?: string;
  updated_at?: string;
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  exercises: Exercise[];
  created_at?: string;
  updated_at?: string;
}

export interface RoutineFolder {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExerciseTemplate {
  id: string;
  name: string;
  category?: string;
  primary_muscle_group?: string;
  secondary_muscle_groups?: string[];
  created_at?: string;
  updated_at?: string;
}

export type Routine_exercises = Exercise;
export type Routine_exercises_sets = ExerciseSet;