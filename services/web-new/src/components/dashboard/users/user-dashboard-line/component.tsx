import { EditIcon, Trash2Icon } from 'lucide-react';
import {
    ActionsContainer,
    TableCell,
    TableRow,
} from '../../table-components/component';
import type { User } from '../../../../types/user.types';
import { Button } from '../../../general/button/component';

type UserDashboardLineProps = {
    // config your component props here
    user: User;
};

export const UserDashboardLine = ({ user }: UserDashboardLineProps) => {
    return (
        <TableRow>
            <TableCell>{user.firstName}</TableCell>
            <TableCell>{user.lastName}</TableCell>
            <TableCell>{user.username}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.phone}</TableCell>
            <TableCell>{user.role}</TableCell>
            <ActionsContainer>
                <Button $variants="base" $color="primary">
                    <EditIcon />
                </Button>
                <Button $variants="base" $color="primary">
                    <Trash2Icon />
                </Button>
            </ActionsContainer>
        </TableRow>
    );
};
