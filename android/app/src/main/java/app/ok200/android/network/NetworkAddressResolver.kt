package app.ok200.android.network

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

enum class NetworkAddressFamily {
    IPV4,
    IPV6
}

enum class NetworkAddressScope {
    LOOPBACK,
    LINK_LOCAL,
    PRIVATE,
    SHARED,
    UNIQUE_LOCAL,
    GLOBAL,
    UNSPECIFIED,
    MULTICAST
}

enum class NetworkAddressAvailability {
    ANOTHER_DEVICE,
    DEVICE_ONLY,
    CHROMEOS_GUEST,
    NON_LAN_TRANSPORT
}

data class ServerNetworkAddress(
    val interfaceName: String?,
    val address: String,
    val prefixLength: Int,
    val family: NetworkAddressFamily,
    val scope: NetworkAddressScope,
    val availability: NetworkAddressAvailability
) {
    val usableFromAnotherDevice: Boolean
        get() = availability == NetworkAddressAvailability.ANOTHER_DEVICE

    fun httpUrl(port: Int): String = when (family) {
        NetworkAddressFamily.IPV4 -> "http://$address:$port"
        NetworkAddressFamily.IPV6 -> "http://[$address]:$port"
    }
}

internal data class CandidateNetworkAddress(
    val interfaceName: String?,
    val address: InetAddress,
    val prefixLength: Int
)

internal object NetworkAddressPolicy {
    fun classify(
        candidates: List<CandidateNetworkAddress>,
        isChromeOs: Boolean,
        peerFacingNetwork: Boolean
    ): List<ServerNetworkAddress> = candidates
        .mapNotNull { classify(it, isChromeOs, peerFacingNetwork) }
        .distinctBy { it.family to it.address }
        .sortedWith(compareBy<ServerNetworkAddress>({ it.family.ordinal }, { it.address }))

    private fun classify(
        candidate: CandidateNetworkAddress,
        isChromeOs: Boolean,
        peerFacingNetwork: Boolean
    ): ServerNetworkAddress? {
        val hostAddress = candidate.address.hostAddress?.substringBefore('%') ?: return null
        val family = when (candidate.address) {
            is Inet4Address -> NetworkAddressFamily.IPV4
            is Inet6Address -> NetworkAddressFamily.IPV6
            else -> return null
        }
        val scope = classifyScope(candidate.address)
        val availability = when {
            scope == NetworkAddressScope.LOOPBACK ||
                scope == NetworkAddressScope.LINK_LOCAL ||
                scope == NetworkAddressScope.UNSPECIFIED ||
                scope == NetworkAddressScope.MULTICAST -> NetworkAddressAvailability.DEVICE_ONLY
            isChromeOs && family == NetworkAddressFamily.IPV4 ->
                NetworkAddressAvailability.CHROMEOS_GUEST
            !peerFacingNetwork -> NetworkAddressAvailability.NON_LAN_TRANSPORT
            else -> NetworkAddressAvailability.ANOTHER_DEVICE
        }
        return ServerNetworkAddress(
            interfaceName = candidate.interfaceName,
            address = hostAddress,
            prefixLength = candidate.prefixLength,
            family = family,
            scope = scope,
            availability = availability
        )
    }

    private fun classifyScope(address: InetAddress): NetworkAddressScope = when {
        address.isAnyLocalAddress -> NetworkAddressScope.UNSPECIFIED
        address.isLoopbackAddress -> NetworkAddressScope.LOOPBACK
        address.isLinkLocalAddress -> NetworkAddressScope.LINK_LOCAL
        address.isMulticastAddress -> NetworkAddressScope.MULTICAST
        address is Inet4Address && isSharedIpv4(address) -> NetworkAddressScope.SHARED
        address is Inet6Address && isUniqueLocalIpv6(address) -> NetworkAddressScope.UNIQUE_LOCAL
        address.isSiteLocalAddress -> NetworkAddressScope.PRIVATE
        else -> NetworkAddressScope.GLOBAL
    }

    private fun isSharedIpv4(address: Inet4Address): Boolean {
        val bytes = address.address
        val first = bytes[0].toInt() and 0xff
        val second = bytes[1].toInt() and 0xff
        return first == 100 && second in 64..127
    }

    private fun isUniqueLocalIpv6(address: Inet6Address): Boolean =
        (address.address[0].toInt() and 0xfe) == 0xfc
}

class NetworkAddressResolver(context: Context) {
    private val appContext = context.applicationContext
    private val connectivityManager = appContext.getSystemService(ConnectivityManager::class.java)

    val isChromeOs: Boolean = isChromeOs(appContext.packageManager)

    fun currentAddresses(): List<ServerNetworkAddress> = runCatching {
        val activeNetwork = connectivityManager.activeNetwork ?: return emptyList()
        val linkProperties = connectivityManager.getLinkProperties(activeNetwork)
            ?: return emptyList()
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
        NetworkAddressPolicy.classify(
            candidates = linkProperties.toCandidates(),
            isChromeOs = isChromeOs,
            peerFacingNetwork = isChromeOs || capabilities.isPeerFacingNetwork()
        )
    }.getOrDefault(emptyList())

    fun registerCallback(onChanged: () -> Unit): ConnectivityManager.NetworkCallback? {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = onChanged()

            override fun onLost(network: Network) = onChanged()

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) = onChanged()

            override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) =
                onChanged()
        }
        return runCatching {
            connectivityManager.registerDefaultNetworkCallback(callback)
            callback
        }.getOrNull()
    }

    fun unregisterCallback(callback: ConnectivityManager.NetworkCallback?) {
        if (callback == null) return
        runCatching { connectivityManager.unregisterNetworkCallback(callback) }
    }

    private fun LinkProperties.toCandidates(): List<CandidateNetworkAddress> =
        linkAddresses.map { linkAddress ->
            CandidateNetworkAddress(
                interfaceName = interfaceName,
                address = linkAddress.address,
                prefixLength = linkAddress.prefixLength
            )
        }

    private fun NetworkCapabilities?.isPeerFacingNetwork(): Boolean =
        this?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ||
            this?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true

    private fun isChromeOs(packageManager: PackageManager): Boolean =
        packageManager.hasSystemFeature(FEATURE_CHROMEOS_ARC) ||
            packageManager.hasSystemFeature(FEATURE_CHROMEOS_ARC_DEVICE_MANAGEMENT)

    private companion object {
        const val FEATURE_CHROMEOS_ARC = "org.chromium.arc"
        const val FEATURE_CHROMEOS_ARC_DEVICE_MANAGEMENT = "org.chromium.arc.device_management"
    }
}
