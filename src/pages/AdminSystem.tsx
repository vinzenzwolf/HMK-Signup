import ServiceStatus from '../components/ServiceStatus'
import UserManagement from '../components/UserManagement'

function AdminSystem() {
  return (
    <div className="form">
      <div className="admin-container">
        <UserManagement />
        <div className="admin-divider" />
        <ServiceStatus />
      </div>
    </div>
  )
}

export default AdminSystem
