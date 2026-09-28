// Supabase is the production DB; explicit Firebase selection is for controlled rollback.
import * as firebase from './firebase-data.js';
import * as supabase from './supabase-data.js';
const adapter=import.meta.env.VITE_DATA_BACKEND === 'firebase' ? firebase : supabase;
export const {data,configured,googleEnabled,dayNumber}=adapter;
