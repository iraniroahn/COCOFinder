import Foundation
import CoreLocation
import Combine

class PumpViewModel: ObservableObject {
    @Published var pumps: [PetrolPump] = []
    @Published var filteredPumps: [PetrolPump] = []
    @Published var searchText: String = ""
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        loadMockData()
        setupSearchSubscription()
    }
    
    private func setupSearchSubscription() {
        $searchText
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] text in
                self?.filterPumps(text: text)
            }
            .store(in: &cancellables)
    }
    
    private func filterPumps(text: String) {
        if text.isEmpty {
            filteredPumps = pumps
        } else {
            filteredPumps = pumps.filter { pump in
                pump.name.localizedCaseInsensitiveContains(text) ||
                pump.address.localizedCaseInsensitiveContains(text)
            }
        }
    }
    
    func loadMockData() {
        // Mock Data for COCO IOCL Pumps across India
        self.pumps = [
            PetrolPump(name: "IOCL COCO Connaught Place", address: "Connaught Place, New Delhi, Delhi 110001", latitude: 28.6304, longitude: 77.2177),
            PetrolPump(name: "IOCL COCO Bandra", address: "Bandra West, Mumbai, Maharashtra 400050", latitude: 19.0596, longitude: 72.8295),
            PetrolPump(name: "IOCL COCO Koramangala", address: "Koramangala, Bangalore, Karnataka 560034", latitude: 12.9279, longitude: 77.6271),
            PetrolPump(name: "IOCL COCO Adyar", address: "Adyar, Chennai, Tamil Nadu 600020", latitude: 13.0012, longitude: 80.2565),
            PetrolPump(name: "IOCL COCO Salt Lake", address: "Salt Lake City, Kolkata, West Bengal 700091", latitude: 22.5868, longitude: 88.4168),
            PetrolPump(name: "IOCL COCO Jubilee Hills", address: "Jubilee Hills, Hyderabad, Telangana 500033", latitude: 17.4326, longitude: 78.4071),
            PetrolPump(name: "IOCL COCO Sector 17", address: "Sector 17, Chandigarh 160017", latitude: 30.7333, longitude: 76.7794),
            PetrolPump(name: "IOCL COCO C G Road", address: "C G Road, Ahmedabad, Gujarat 380009", latitude: 23.0225, longitude: 72.5714),
            PetrolPump(name: "IOCL COCO Civil Lines", address: "Civil Lines, Jaipur, Rajasthan 302006", latitude: 26.9124, longitude: 75.7873),
            PetrolPump(name: "IOCL COCO Hazratganj", address: "Hazratganj, Lucknow, Uttar Pradesh 226001", latitude: 26.8467, longitude: 80.9462)
        ]
        self.filteredPumps = self.pumps
    }
    
    func nearestPump(to location: CLLocation) -> PetrolPump? {
        return pumps.min(by: {
            let loc1 = CLLocation(latitude: $0.latitude, longitude: $0.longitude)
            let loc2 = CLLocation(latitude: $1.latitude, longitude: $1.longitude)
            return loc1.distance(from: location) < loc2.distance(from: location)
        })
    }
}
