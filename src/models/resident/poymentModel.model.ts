export interface payment {
    id: number,
    title: string,
    description: string,
    total: number,
    date: string,
    overdue_in: string,
    overdue: string
}

export interface fines {
    id : number,
    fines_references : string,
    fines_name : string,
    start_date : string,
    due_date : string,
    total_bill : number,
    is_pay : boolean,
    overdue: boolean, // Menentukan status overdue
    offence_data : [
        {
            id : number,
            vehicle_number : string,
        }
    ]
}