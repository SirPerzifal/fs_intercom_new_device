export interface LoginParams {
    login: string;
    password: string;
}

export interface EstateProfile {
    family_id: number;
    family_name: string;
    family_email: string;
    family_mobile_number: string;
    family_type: string;
    unit_id: number;
    unit_name: string;
    block_id: number;
    block_name: string;
    project_id: number;
    project_name: string;
    project_image: string;
}

export interface Estate {
    user_id: number;
    family_id: number;
    family_name: string;
    family_nickname: string;
    image_profile: string;
    family_email: string;
    family_mobile_number: string;
    family_type: string;
    unit_id: number;
    unit_name: string;
    block_id: number;
    block_name: string;
    project_id: number;
    project_name: string;
    project_image: string;
    record_type: string;
}

// visitor
export interface FormData {
    dateOfInvite: string;
    vehicleNumber: string;
    entryType: string;
    entryTitle: string;
    entryMessage: string;
    isProvideUnit: boolean;
    facility: string,
    facility_other: string,
    hiredCar: string;
    unit: number;
  }

export interface Invitee {
  visitor_name: string;
  vehicle_number: string;
  contact_number: string;
  contact_number_display: string;
}