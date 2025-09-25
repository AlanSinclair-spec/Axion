import Telnyx from 'telnyx';
import dotenv from 'dotenv';

dotenv.config();

export const telnyxClient = new Telnyx(process.env.TELNYX_API_KEY);

export const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY;